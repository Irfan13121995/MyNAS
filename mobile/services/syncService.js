import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { offlineQueueService } from './offlineQueueService';

let MediaLibrary = null;
const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

if (!isExpoGo) {
  try {
    MediaLibrary = require('expo-media-library/legacy');
  } catch (e) {
    try {
      MediaLibrary = require('expo-media-library');
    } catch (err) {
      MediaLibrary = null;
    }
  }
}

export async function checkSyncConstraints() {
  try {
    const wifiOnly = (await AsyncStorage.getItem('autosync_wifi_only')) === 'true';
    const chargingOnly = (await AsyncStorage.getItem('autosync_charging_only')) === 'true';
    const lowBatteryPause = (await AsyncStorage.getItem('autosync_low_battery_pause')) !== 'false'; // default true

    if (wifiOnly) {
      const netState = await Network.getNetworkStateAsync();
      if (netState.type !== Network.NetworkStateType.WIFI) {
        return { allowed: false, reason: 'Auto-sync is set to Wi-Fi only.' };
      }
    }

    if (chargingOnly) {
      const batteryState = await Battery.getBatteryStateAsync();
      const isCharging = batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL;
      if (!isCharging) {
        return { allowed: false, reason: 'Auto-sync is set to sync only while charging.' };
      }
    }

    if (lowBatteryPause) {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      if (batteryLevel > 0 && batteryLevel < 0.20) {
        const batteryState = await Battery.getBatteryStateAsync();
        const isCharging = batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL;
        if (!isCharging) {
          return { allowed: false, reason: 'Battery is below 20%. Auto-sync paused.' };
        }
      }
    }

    return { allowed: true };
  } catch (e) {
    return { allowed: true };
  }
}

export async function requestMediaPermissions() {
  if (MediaLibrary && typeof MediaLibrary.requestPermissionsAsync === 'function') {
    try {
      const res = await MediaLibrary.requestPermissionsAsync();
      if (res.granted || res.status === 'granted' || res.accessPrivileges === 'all' || res.accessPrivileges === 'limited') {
        return true;
      }
    } catch (e) {}
  }
  
  // Fallback to ImagePicker permissions
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    return false;
  }
}

export async function getNewMediaToSync(serverUrl, token, syncFolder, mediaType) {
  if (!MediaLibrary || typeof MediaLibrary.getAssetsAsync !== 'function') {
    return { newFiles: [], totalOnDevice: 0, alreadySynced: 0, isExpoGo: true };
  }

  // 1. Fetch server manifest
  let serverManifest = [];
  try {
    const res = await fetch(`${serverUrl}/api/sync/manifest?folder=${encodeURIComponent(syncFolder)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      serverManifest = data.files || data;
    }
  } catch (err) {
    console.warn('Failed to fetch server manifest', err);
  }

  const serverSet = new Set(serverManifest.map(f => `${f.name}_${f.size}`));

  // 2. Scan device media
  const lastSyncTime = await AsyncStorage.getItem('autosync_last_sync_time');
  const createdAfter = lastSyncTime ? parseInt(lastSyncTime, 10) : 0;

  const typeMap = {
    photos: ['photo'],
    videos: ['video'],
    both: ['photo', 'video']
  };
  const mediaTypes = typeMap[mediaType] || ['photo', 'video'];

  let localAssets = [];
  let hasNextPage = true;
  let endCursor = undefined;

  try {
    while (hasNextPage) {
      const page = await MediaLibrary.getAssetsAsync({
        first: 100,
        after: endCursor,
        mediaType: mediaTypes,
        sortBy: 'creationTime',
        createdAfter: createdAfter > 0 ? createdAfter : undefined
      });

      localAssets = localAssets.concat(page.assets);
      hasNextPage = page.hasNextPage;
      endCursor = page.endCursor;
    }
  } catch (err) {
    return { newFiles: [], totalOnDevice: 0, alreadySynced: 0, isExpoGo: true };
  }

  let newFiles = [];
  let alreadySynced = 0;

  for (const asset of localAssets) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      if (!info) continue;

      const size = info.size || 0;
      const matchKey = `${asset.filename}_${size}`;

      if (serverSet.has(matchKey) || serverSet.has(`${asset.filename}_undefined`)) {
        alreadySynced++;
      } else {
        newFiles.push({
          uri: info.localUri || info.uri,
          filename: asset.filename || `photo_${Date.now()}.jpg`,
          width: asset.width,
          height: asset.height,
          mediaType: asset.mediaType,
          fileSize: size,
          creationTime: asset.creationTime,
          modificationTime: asset.modificationTime
        });
      }
    } catch (e) {}
  }

  return {
    newFiles,
    totalOnDevice: localAssets.length,
    alreadySynced,
    isExpoGo: false
  };
}

export async function validateTargetNASFolder(serverUrl, token, destination, requiredBytes = 0) {
  try {
    const res = await fetch(`${serverUrl}/api/sync/validate-target`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ destination, requiredBytes })
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

export function formatDestinationFolder(baseFolder, deviceName, folderStructure, asset = {}) {
  let subPath = (baseFolder || 'Mobile Backups').replace(/[/\\]+$/, '');
  const device = deviceName || 'Device';

  if (folderStructure === 'date') {
    const timestamp = asset.creationTime || asset.modificationTime || Date.now();
    const date = new Date(timestamp);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${subPath}/${device}/${yyyy}/${mm}`;
  } else if (folderStructure === 'album' && asset.albumName) {
    const cleanAlbum = asset.albumName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
    return `${subPath}/${device}/${cleanAlbum || 'Photos'}`;
  }

  // Default flat structure
  return `${subPath}/${device}/Photos`;
}

export async function uploadFile(serverUrl, token, file, destination, onProgress) {
  const filename = file.filename || file.fileName || `media_${Date.now()}.${file.type === 'video' ? 'mp4' : 'jpg'}`;
  const fileSize = file.fileSize || file.size || 0;

  // Use chunked streaming upload for files larger than 10MB
  if (fileSize > 10 * 1024 * 1024) {
    return uploadFileChunked(serverUrl, token, file, destination, onProgress);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${serverUrl}/api/upload?destination=${encodeURIComponent(destination)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ success: true, response: xhr.responseText });
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload network error'));

    const formData = new FormData();
    const mimeType = file.mimeType || (file.mediaType === 'video' || filename.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');

    formData.append('file', {
      uri: file.uri,
      name: filename,
      type: mimeType
    });

    xhr.send(formData);
  });
}

export async function uploadFileChunked(serverUrl, token, file, destination, onProgress) {
  const filename = file.filename || file.fileName || `media_${Date.now()}.mp4`;
  const fileSize = file.fileSize || file.size || 0;
  const chunkSize = 5 * 1024 * 1024; // 5MB chunks
  const totalChunks = Math.max(1, Math.ceil(fileSize / chunkSize));

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    let attempts = 0;
    let success = false;

    while (attempts < 3 && !success) {
      try {
        attempts++;
        const formData = new FormData();
        formData.append('fileName', filename);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('destination', destination);
        formData.append('chunk', {
          uri: file.uri,
          name: `${filename}.part${chunkIndex}`,
          type: 'application/octet-stream'
        });

        const res = await fetch(`${serverUrl}/api/upload/chunk`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });

        if (res.ok) {
          success = true;
          if (onProgress) {
            onProgress((chunkIndex + 1) / totalChunks);
          }
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempts));
        }
      } catch (err) {
        if (attempts >= 3) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempts));
      }
    }
  }

  return { success: true, filename, totalChunks };
}

export async function pickAndSyncGallery(serverUrl, token, syncFolder, onProgress) {
  const constraint = await checkSyncConstraints();
  if (!constraint.allowed) {
    return { success: false, message: constraint.reason };
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { success: false, message: 'Permission to access gallery was denied.' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 1,
    selectionLimit: 0
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return { success: true, cancelled: true, synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;
  const total = result.assets.length;

  for (let i = 0; i < total; i++) {
    const asset = result.assets[i];
    const filename = asset.fileName || `media_${Date.now()}_${i}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;

    if (onProgress) {
      onProgress({
        currentIndex: i + 1,
        totalFiles: total,
        currentFileProgress: 0,
        filename
      });
    }

    try {
      await uploadFile(serverUrl, token, {
        uri: asset.uri,
        filename: filename,
        mimeType: asset.mimeType,
        mediaType: asset.type
      }, syncFolder, (prog) => {
        if (onProgress) {
          onProgress({
            currentIndex: i + 1,
            totalFiles: total,
            currentFileProgress: prog,
            filename
          });
        }
      });
      synced++;
    } catch (err) {
      console.warn('Picker upload failed:', err.message);
      await offlineQueueService.addToQueue({
        uri: asset.uri,
        filename,
        mimeType: asset.mimeType,
        mediaType: asset.type
      }, syncFolder);
      failed++;
    }
  }

  if (synced > 0) {
    const prevCount = parseInt(await AsyncStorage.getItem('autosync_synced_count') || '0', 10);
    await AsyncStorage.setItem('autosync_synced_count', (prevCount + synced).toString());
    await AsyncStorage.setItem('autosync_last_sync_time', Date.now().toString());
  }

  return { success: true, cancelled: false, synced, failed };
}

export async function runFullSync(serverUrl, token, syncFolder, mediaType, onProgress, onFileComplete) {
  const constraint = await checkSyncConstraints();
  if (!constraint.allowed) {
    return { synced: 0, failed: 0, skipped: 0, constraintBlocked: true, message: constraint.reason };
  }

  if (!MediaLibrary || typeof MediaLibrary.getAssetsAsync !== 'function') {
    // Expo Go fallback to ImagePicker
    return await pickAndSyncGallery(serverUrl, token, syncFolder, onProgress);
  }

  const perm = await requestMediaPermissions();
  if (!perm) return { synced: 0, failed: 0, skipped: 0 };

  const { newFiles, alreadySynced, isExpoGo } = await getNewMediaToSync(serverUrl, token, syncFolder, mediaType);
  
  if (isExpoGo) {
    return await pickAndSyncGallery(serverUrl, token, syncFolder, onProgress);
  }

  let synced = 0;
  let failed = 0;
  const total = newFiles.length;

  for (let i = 0; i < total; i++) {
    const file = newFiles[i];
    
    if (onProgress) {
      onProgress({
        currentIndex: i + 1,
        totalFiles: total,
        currentFileProgress: 0,
        filename: file.filename
      });
    }

    try {
      await uploadFile(serverUrl, token, file, syncFolder, (prog) => {
        if (onProgress) {
          onProgress({
            currentIndex: i + 1,
            totalFiles: total,
            currentFileProgress: prog,
            filename: file.filename
          });
        }
      });
      synced++;
      if (onFileComplete) onFileComplete(file);
    } catch (e) {
      console.warn('Failed to upload file', file.filename, e);
      await offlineQueueService.addToQueue(file, syncFolder);
      failed++;
    }
  }

  // Attempt to process any queued offline files
  try {
    await offlineQueueService.processQueue(
      (f, dest, progCb) => uploadFile(serverUrl, token, f, dest, progCb)
    );
  } catch (qErr) {}

  if (synced > 0) {
    const prevCount = parseInt(await AsyncStorage.getItem('autosync_synced_count') || '0', 10);
    await AsyncStorage.setItem('autosync_synced_count', (prevCount + synced).toString());
    await AsyncStorage.setItem('autosync_last_sync_time', Date.now().toString());
  }

  return { synced, failed, skipped: alreadySynced };
}

