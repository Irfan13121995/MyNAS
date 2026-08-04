import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function BackupPanel({ serverUrl, token, drives, onClose }) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deviceName, setDeviceName] = useState('MobileDevice');
  const [selectedDrive, setSelectedDrive] = useState('');
  
  // Stats
  const [galleryCount, setGalleryCount] = useState(0);
  const [backedUpIds, setBackedUpIds] = useState([]);
  const [pendingSyncList, setPendingSyncList] = useState([]);
  
  // Sync Status
  const [syncing, setSyncing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalToSync, setTotalToSync] = useState(0);
  const [syncLog, setSyncLog] = useState('');

  // 1. Initialize and check permissions
  useEffect(() => {
    const initialize = async () => {
      try {
        // Resolve Device Name
        const name = Device.deviceName || Device.modelName || 'UnknownDevice';
        const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_');
        setDeviceName(sanitizedName);

        // Select default backup drive (prefer external drive or first drive)
        if (drives && drives.length > 0) {
          const usbDrive = drives.find(d => d.isUsb);
          setSelectedDrive((usbDrive || drives[0]).path);
        }

        // Check Media permissions
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          setPermissionGranted(true);
          await loadBackupStats(sanitizedName);
        } else {
          Alert.alert('Permission Required', 'NAS Backup needs access to your gallery to sync photos.');
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  // 2. Load Gallery Assets and match against cache
  const loadBackupStats = async (sanitizedDeviceName) => {
    try {
      // Load saved database of backed up asset IDs
      const savedIdsJson = await AsyncStorage.getItem(`nas_backup_synced_${sanitizedDeviceName}`);
      const syncedIds = savedIdsJson ? JSON.parse(savedIdsJson) : [];
      setBackedUpIds(syncedIds);

      // Fetch assets from media library
      const assetsResult = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        first: 500, // Sync up to the last 500 media files in history
        sortBy: ['creationTime']
      });

      const allAssets = assetsResult.assets;
      setGalleryCount(allAssets.length);

      // Compare which ones are not backed up
      const pending = allAssets.filter(asset => !syncedIds.includes(asset.id));
      setPendingSyncList(pending);
    } catch (err) {
      console.error('Error loading gallery stats:', err);
    }
  };

  // 3. Sync Execution Flow
  const startBackupSync = async () => {
    if (!selectedDrive) {
      Alert.alert('Select a Drive', 'Choose a NAS destination drive before starting the backup.');
      return;
    }

    if (pendingSyncList.length === 0) {
      Alert.alert('All Caught Up!', 'No new photos or videos to sync.');
      return;
    }

    setSyncing(true);
    setTotalToSync(pendingSyncList.length);
    setCurrentProgress(0);
    setSyncLog('Starting connection handshake...');

    // The server validates Windows drive roots, so use its canonical drive path
    // (for example, "D:\\") rather than the volume's display name.
    const targetPath = `${selectedDrive.replace(/[\\/]+$/, '')}\\NAS_Backup\\${deviceName}`;
    const newSyncedIds = [...backedUpIds];
    let successCount = 0;

    try {
      for (let i = 0; i < pendingSyncList.length; i++) {
        const asset = pendingSyncList[i];
        setCurrentProgress(i + 1);
        setSyncLog(`Syncing [${i + 1}/${pendingSyncList.length}] - ${asset.filename}...`);

        // Get full asset detail to retrieve local file path (especially on iOS)
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
        const fileUri = assetInfo.localUri || assetInfo.uri;

        if (!fileUri) {
          setSyncLog(`Skipping ${asset.filename} (could not locate local path)`);
          continue;
        }

        // Prepare multipart form upload
        const formData = new FormData();
        formData.append('file', {
          uri: fileUri,
          name: asset.filename || `upload_${Date.now()}.${asset.filename?.split('.').pop() || 'jpg'}`,
          type: asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'
        });

        const uploadUrl = `${serverUrl}/api/upload?destination=${encodeURIComponent(targetPath)}`;
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          },
          body: formData
        });

        const resData = await response.json();
        
        if (response.ok && resData.success) {
          successCount++;
          newSyncedIds.push(asset.id);
          // Periodically save to storage to avoid losing progress in case of crash
          await AsyncStorage.setItem(`nas_backup_synced_${deviceName}`, JSON.stringify(newSyncedIds));
          setBackedUpIds([...newSyncedIds]);
        } else {
          console.error(`Failed to upload ${asset.filename}:`, resData.error);
        }
      }

      setSyncLog(`Backup Sync Complete! Successfully uploaded ${successCount} files.`);
      // Reload stats
      await loadBackupStats(deviceName);
      Alert.alert('Backup Finished', `Successfully backed up ${successCount} files to your NAS!`);
    } catch (err) {
      Alert.alert('Backup Interrupted', 'An error occurred during sync: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const progressPercent = totalToSync > 0 ? (currentProgress / totalToSync) * 100 : 0;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Initializing backup modules...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={syncing}>
          <Text style={styles.closeBtnText}>✕ Close</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Backup Sync Center</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.body}>
        {permissionGranted ? (
          <View style={styles.content}>
            {/* Device Info */}
            <View style={styles.infoCard}>
              <Text style={styles.cardHeader}>📱 Device Name</Text>
              <Text style={styles.cardValue}>{deviceName.replace(/_/g, ' ')}</Text>
            </View>

            {/* Target Drive Settings */}
            <View style={styles.infoCard}>
              <Text style={styles.cardHeader}>💾 Destination Drive</Text>
              <View style={styles.driveRow}>
                {drives.map(drive => (
                  <TouchableOpacity
                    key={drive.path}
                    style={[
                      styles.driveBadge,
                      selectedDrive === drive.path && styles.driveBadgeActive
                    ]}
                    onPress={() => setSelectedDrive(drive.path)}
                    disabled={syncing}
                  >
                    <Text style={[
                      styles.driveBadgeText,
                      selectedDrive === drive.path && styles.driveBadgeTextActive
                    ]}>
                      {drive.name} ({drive.isUsb ? 'USB' : 'Internal'})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.pathMeta}>
                Backup drive: {selectedDrive || 'Select a drive'}
              </Text>
            </View>

            {/* Backup Stats */}
            <View style={styles.statsCard}>
              <View style={styles.statCol}>
                <Text style={styles.statNum}>{galleryCount}</Text>
                <Text style={styles.statLabel}>Found Photos</Text>
              </View>
              <View style={styles.statCol}>
                <Text style={styles.statNum}>{backedUpIds.length}</Text>
                <Text style={styles.statLabel}>Backed Up</Text>
              </View>
              <View style={styles.statCol}>
                <Text style={[styles.statNum, pendingSyncList.length > 0 && { color: '#FFB300' }]}>
                  {pendingSyncList.length}
                </Text>
                <Text style={styles.statLabel}>Pending Sync</Text>
              </View>
            </View>

            {/* Progress Area */}
            {syncing && (
              <View style={styles.progressContainer}>
                <Text style={styles.progressText}>
                  Syncing {currentProgress} / {totalToSync} files
                </Text>
                
                {/* Custom Progress Bar */}
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                </View>
                
                <Text style={styles.logText} numberOfLines={2}>{syncLog}</Text>
              </View>
            )}

            {!syncing && !syncLog && (
              <Text style={styles.helpText}>
                Click the button below to upload new photos and videos dynamically to your NAS storage.
              </Text>
            )}

            {!syncing && syncLog && (
              <View style={styles.completedLogCard}>
                <Text style={styles.completedLogText}>{syncLog}</Text>
              </View>
            )}

            {/* Action Button */}
            {!syncing ? (
              <TouchableOpacity
                style={[
                  styles.syncButton,
                  pendingSyncList.length === 0 && styles.syncButtonDisabled
                ]}
                onPress={startBackupSync}
                disabled={pendingSyncList.length === 0}
              >
                <Text style={styles.syncButtonText}>
                  {pendingSyncList.length === 0 ? 'Sync Complete' : 'Start Backup Sync Now'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.syncingPlaceholderBtn}>
                <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />
                <Text style={styles.syncButtonText}>Syncing Files...</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.centerContainer}>
            <Text style={styles.unsupportedIcon}>⚠️</Text>
            <Text style={styles.unsupportedText}>Gallery Permissions Denied</Text>
            <Text style={styles.helpText}>
              Please enable photos permissions for Expo Go in your phone settings to back up.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: '#222',
  },
  closeBtn: {
    backgroundColor: '#222',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  closeBtnText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: 'bold',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  body: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 10,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  infoCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardHeader: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  cardValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  driveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  driveBadge: {
    backgroundColor: '#2d2d2d',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginRight: 10,
    marginBottom: 5,
  },
  driveBadgeActive: {
    backgroundColor: '#4285F4',
  },
  driveBadgeText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  driveBadgeTextActive: {
    color: '#fff',
  },
  pathMeta: {
    color: '#666',
    fontSize: 11,
    marginTop: 8,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    padding: 15,
    justifyContent: 'space-around',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  statCol: {
    alignItems: 'center',
  },
  statNum: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  progressContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#2d2d2d',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4E90FE',
  },
  logText: {
    color: '#aaa',
    fontSize: 12,
  },
  helpText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  completedLogCard: {
    backgroundColor: '#0a2310',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#114a1a',
    marginBottom: 20,
  },
  completedLogText: {
    color: '#4caf50',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  syncButton: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  syncButtonDisabled: {
    backgroundColor: '#2d2d2d',
  },
  syncingPlaceholderBtn: {
    flexDirection: 'row',
    backgroundColor: '#FF9800',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  unsupportedIcon: {
    fontSize: 64,
    marginBottom: 15,
  },
  unsupportedText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  }
});
