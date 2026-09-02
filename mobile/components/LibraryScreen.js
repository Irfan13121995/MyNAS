import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions, Alert, Platform, StatusBar, ScrollView, Modal, TextInput
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { requestMediaPermissions, uploadFile } from '../services/syncService';
import { cacheService } from '../services/cacheService';
import { useTheme } from '../contexts/ThemeContext';
import FileExplorerModal from './FileExplorerModal';

const { width } = Dimensions.get('window');
const GAP = 3;
const COLUMN_WIDTH = (width - GAP * 4) / 3;

function normalizeExt(item) {
  let ext = item.ext || '';
  if (!ext && item.name) {
    const parts = item.name.split('.');
    ext = parts.length > 1 ? parts.pop() : '';
  }
  ext = ext.toLowerCase().replace(/^\.*/, '');
  return ext ? '.' + ext : '';
}

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.wmv', '.m4v', '.3gp', '.ts']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.tiff', '.svg']);

function isVideoFile(item) {
  if (item.isVideo || item.type === 'video' || item.mediaType === 'video') return true;
  return VIDEO_EXTS.has(normalizeExt(item));
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatDateLabel(dateStr) {
  const today = new Date();
  const d = new Date(dateStr);
  const todayStr = today.toISOString().slice(0, 10);
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const yestStr = yest.toISOString().slice(0, 10);
  const itemStr = d.toISOString().slice(0, 10);
  if (itemStr === todayStr) return 'Today';
  if (itemStr === yestStr) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function groupMediaByDate(items) {
  const groups = {};
  items.forEach(item => {
    const dateKey = (item.modifiedAt || item.creationTime || new Date().toISOString()).slice(0, 10);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(item);
  });
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const result = [];
  sortedKeys.forEach(key => {
    result.push({ isSectionHeader: true, dateKey: key, label: formatDateLabel(key), count: groups[key].length });
    groups[key].forEach(item => result.push(item));
  });
  return result;
}

const ImageItem = React.memo(({ thumbUri }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [error, setError] = useState(false);
  if (error) {
    return (
      <View style={[styles.thumbnail, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSolid }]}>
        <Text style={{fontSize: 24}}>🖼️</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: thumbUri }}
      style={styles.thumbnail}
      contentFit="cover"
      transition={150}
      diskCachePolicy="always"
      recyclingKey={thumbUri}
      placeholder={require('../assets/icon.png')}
      onError={() => setError(true)}
    />
  );
});

export default function LibraryScreen({ serverUrl, token, drives = [], initialFilter = 'all', onSelectMedia }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [activeSource, setActiveSource] = useState('nas'); // 'nas' | 'device'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [deviceMediaItems, setDeviceMediaItems] = useState([]);
  const [hasPermission, setHasPermission] = useState(null);
  const [filterMode, setFilterMode] = useState(initialFilter);
  const [extFilter, setExtFilter] = useState('ALL');
  const [driveFilter, setDriveFilter] = useState('ALL');
  const [availableDrives, setAvailableDrives] = useState(drives);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showExtModal, setShowExtModal] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (drives && drives.length > 0) {
      setAvailableDrives(drives);
      const defaultDriveLetter = drives[0]?.letter || 'C';
      setTargetDrive(defaultDriveLetter);
      setTargetFolder(`${defaultDriveLetter}:\\MobileUploads`);
    } else if (serverUrl && token) {
      fetch(`${serverUrl}/api/drives`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          const driveList = Array.isArray(data) ? data : data.drives || [];
          setAvailableDrives(driveList);
          if (driveList.length > 0) {
            const letter = driveList[0]?.letter || 'C';
            setTargetDrive(letter);
            setTargetFolder(`${letter}:\\MobileUploads`);
          }
        })
        .catch(() => {});
    }
  }, [drives, serverUrl, token]);

  // Mobile Gallery & Target Upload States
  const [deviceEndCursor, setDeviceEndCursor] = useState(null);
  const [deviceHasNextPage, setDeviceHasNextPage] = useState(true);

  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [targetDrive, setTargetDrive] = useState('C');
  const [targetFolder, setTargetFolder] = useState('C:\\MobileUploads');
  const [folderExplorerVisible, setFolderExplorerVisible] = useState(false);

  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: '', percent: 0 });

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [deviceTotalCount, setDeviceTotalCount] = useState(0);
  const [deviceViewMode, setDeviceViewMode] = useState('all'); // 'all' | 'albums'
  const [albums, setAlbums] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  useEffect(() => {
    if (initialFilter) {
      setFilterMode(initialFilter);
    }
  }, [initialFilter]);

  const checkPermissions = async () => {
    const granted = await requestMediaPermissions();
    setHasPermission(granted);
    if (granted && activeSource === 'device') {
      loadDeviceMedia();
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  const getItemLayout = useCallback((data, index) => ({
    length: COLUMN_WIDTH + GAP,
    offset: (COLUMN_WIDTH + GAP) * Math.floor(index / 3),
    index,
  }), []);

  const handleDriveFilterChange = (drive) => {
    setDriveFilter(drive);
    setPage(1);
    setLoading(true);
    fetchGallery(drive);
  };

  const fetchGallery = async (drive = driveFilter) => {
    if (drive === 'ALL') {
      const cached = await cacheService.get('gallery_media_items');
      if (cached && cached.length > 0) {
        setMediaItems(cached);
        setLoading(false);
      }
    }

    try {
      const driveParam = drive && drive !== 'ALL' ? `&drive=${encodeURIComponent(drive)}` : '';
      const res = await fetch(`${serverUrl}/api/gallery?page=1&limit=100${driveParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMediaItems(data.items || []);
        setPage(data.page || 1);
        setHasMore(data.hasMore ?? false);
        if (drive === 'ALL') {
          await cacheService.set('gallery_media_items', data.items || []);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch gallery media:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMoreMedia = async () => {
    if (activeSource !== 'nas' || !hasMore || loading || refreshing || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const driveParam = driveFilter && driveFilter !== 'ALL' ? `&drive=${encodeURIComponent(driveFilter)}` : '';
      const res = await fetch(`${serverUrl}/api/gallery?page=${nextPage}&limit=100${driveParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMediaItems(prev => [...prev, ...(data.items || [])]);
        setPage(data.page || nextPage);
        setHasMore(data.hasMore ?? false);
      }
    } catch (err) {
      console.warn('Failed to load more media:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadDeviceMedia = async (isLoadMore = false) => {
    if (isLoadMore && (!deviceHasNextPage || loadingMore)) return;
    if (!isLoadMore) setLoading(true);
    else setLoadingMore(true);

    try {
      let perm = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
      if (!perm.granted && perm.status !== 'granted') {
        perm = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      }
      const granted = perm.granted || perm.status === 'granted' || perm.accessPrivileges === 'all' || perm.accessPrivileges === 'limited';
      setHasPermission(granted);

      if (!granted) {
        // Try fallback to requestMediaPermissions helper
        const helperGranted = await requestMediaPermissions();
        setHasPermission(helperGranted);
        if (!helperGranted) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
          return;
        }
      }

      // Get total count on first load (first must be >= 1)
      if (!isLoadMore) {
        try {
          const countResult = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: ['photo', 'video'] });
          setDeviceTotalCount(countResult.totalCount || 0);
        } catch (e) {}
      }

      const mediaTypes = filterMode === 'videos' ? ['video'] : filterMode === 'photos' ? ['photo'] : ['photo', 'video'];
      let media;

      try {
        media = await MediaLibrary.getAssetsAsync({
          mediaType: mediaTypes,
          sortBy: ['creationTime'],
          first: 100,
          after: isLoadMore ? deviceEndCursor : undefined,
          ...(selectedAlbum ? { album: selectedAlbum.id } : {}),
        });
      } catch (err1) {
        // Fallback without sortBy if native module rejects sortBy array format
        media = await MediaLibrary.getAssetsAsync({
          mediaType: mediaTypes,
          first: 100,
          after: isLoadMore ? deviceEndCursor : undefined,
          ...(selectedAlbum ? { album: selectedAlbum.id } : {}),
        });
      }

      if (media && media.assets) {
        const mapped = media.assets.map(a => ({
          id: a.id,
          name: a.filename || `device_${a.id}.${a.mediaType === 'video' ? 'mp4' : 'jpg'}`,
          path: a.uri,
          uri: a.uri,
          isDevice: true,
          isVideo: a.mediaType === 'video',
          mediaType: a.mediaType,
          size: a.width && a.height ? Math.round(a.width * a.height * 0.4) : 0,
          modifiedAt: new Date(a.creationTime || Date.now()).toISOString(),
          duration: a.duration
        }));

        if (isLoadMore) {
          setDeviceMediaItems(prev => [...prev, ...mapped]);
        } else {
          setDeviceMediaItems(mapped);
        }

        setDeviceEndCursor(media.endCursor);
        setDeviceHasNextPage(media.hasNextPage);
      }
    } catch (err) {
      console.warn('Failed to load device media assets:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const loadAlbums = async () => {
    try {
      let perm = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
      if (!perm.granted && perm.status !== 'granted') {
        perm = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      }
      if (!perm.granted && perm.status !== 'granted' && perm.accessPrivileges !== 'all') return;
      const albumList = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      // Get cover asset for each album
      const albumsWithCovers = await Promise.all(
        albumList.filter(a => a.assetCount > 0).map(async (album) => {
          let coverUri = null;
          try {
            const assets = await MediaLibrary.getAssetsAsync({ album: album.id, first: 1, sortBy: ['creationTime'] });
            if (assets.assets.length > 0) coverUri = assets.assets[0].uri;
          } catch (e) {}
          return { ...album, coverUri };
        })
      );
      setAlbums(albumsWithCovers.sort((a, b) => b.assetCount - a.assetCount));
    } catch (err) {
      console.warn('Failed to load albums:', err);
    }
  };

  const pickCustomDeviceMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 0
      });

      if (!result.canceled && result.assets) {
        const mapped = result.assets.map(a => ({
          name: a.fileName || `device_${Date.now()}.jpg`,
          path: a.uri,
          uri: a.uri,
          isDevice: true,
          isVideo: a.type === 'video',
          mediaType: a.type,
          size: a.fileSize || 0,
          modifiedAt: new Date().toISOString()
        }));
        setDeviceMediaItems(prev => [...mapped, ...prev]);
      }
    } catch (err) {
      console.warn('Failed to pick device media:', err);
    }
  };

  const startBatchUpload = async (itemsToUpload, destinationPath) => {
    setUploadModalVisible(false);
    setIsBatchUploading(true);
    setUploadProgress({ current: 0, total: itemsToUpload.length, fileName: '', percent: 0 });

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < itemsToUpload.length; i++) {
      const item = itemsToUpload[i];
      let uploadUri = item.uri || item.path;
      let filename = item.name || item.filename || `mobile_${Date.now()}_${i}.${item.isVideo ? 'mp4' : 'jpg'}`;

      if (item.id) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(item.id);
          if (info && (info.localUri || info.uri)) {
            uploadUri = info.localUri || info.uri;
          }
        } catch (e) {}
      }

      setUploadProgress({
        current: i + 1,
        total: itemsToUpload.length,
        fileName: filename,
        percent: 0
      });

      try {
        const fileObj = {
          uri: uploadUri,
          filename: filename,
          name: filename,
          size: item.size || 0,
          fileSize: item.size || 0,
          mimeType: item.isVideo ? 'video/mp4' : 'image/jpeg',
          mediaType: item.isVideo ? 'video' : 'image'
        };

        await uploadFile(serverUrl, token, fileObj, destinationPath, (pct) => {
          setUploadProgress(prev => ({ ...prev, percent: Math.round(pct * 100) }));
        });
        successCount++;
      } catch (err) {
        console.warn(`Failed to upload ${filename}:`, err);
        failedCount++;
      }
    }

    setIsBatchUploading(false);
    setSelectedItems(new Set());
    setIsSelectionMode(false);

    Alert.alert(
      'Upload Complete 🎉',
      `Successfully uploaded ${successCount} photos/videos to NAS folder:\n${destinationPath}${failedCount > 0 ? `\n\n(${failedCount} items failed to upload)` : ''}`
    );
  };

  const handleGrantPermission = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setHasPermission(perm.granted);
    if (perm.granted) {
      if (activeSource === 'device') {
        loadDeviceMedia();
      } else {
        Alert.alert('Permission Granted', 'Personal NAS can now access your phone photos & videos for backup and view.');
      }
    } else {
      Alert.alert('Permission Required', 'Please enable media library access in your phone settings to view device media.');
    }
  };

  useEffect(() => {
    if (activeSource === 'nas') {
      fetchGallery();
    } else if (activeSource === 'device') {
      if (hasPermission) {
        loadDeviceMedia();
      } else {
        setLoading(false);
      }
    }
  }, [activeSource, selectedAlbum]);

  const onRefresh = () => {
    setRefreshing(true);
    if (activeSource === 'nas') {
      fetchGallery();
    } else {
      loadDeviceMedia();
    }
  };

  const activeMediaList = activeSource === 'nas' ? mediaItems : deviceMediaItems;

  const filteredMedia = useMemo(() => {
    const filtered = activeMediaList.filter(item => {
      if (activeSource === 'nas' && driveFilter !== 'ALL') {
        const itemDrive = (item.drive || item.path || '').toUpperCase();
        const normTarget = driveFilter.toUpperCase().replace(/[\/\\]+$/, '');
        if (!itemDrive.startsWith(normTarget)) return false;
      }

      const isVid = isVideoFile(item);
      if (filterMode === 'videos' && !isVid) return false;
      if (filterMode === 'photos' && isVid) return false;
      
      if (extFilter !== 'ALL') {
        const ext = extFilter.toLowerCase();
        const name = (item.name || '').toLowerCase();
        const filename = (item.filename || '').toLowerCase();
        if (!name.endsWith(ext) && !filename.endsWith(ext)) return false;
      }
      return true;
    });

    // Group by date for device media
    if (activeSource === 'device' && deviceViewMode === 'all') {
      return groupMediaByDate(filtered);
    }
    return filtered;
  }, [activeMediaList, activeSource, driveFilter, filterMode, extFilter, deviceViewMode]);

  const renderMediaItem = useCallback(({ item }) => {
    // Date Section Header
    if (item.isSectionHeader) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
          <Text style={styles.sectionHeaderCount}>{item.count} items</Text>
        </View>
      );
    }

    const thumbUri = item.isDevice
      ? item.uri
      : `${serverUrl}/api/thumbnail?path=${encodeURIComponent(item.path)}&token=${token}`;
    const isVid = isVideoFile(item);
    const ext = normalizeExt(item);
    const isGif = ext === '.gif';
    const itemKey = item.path || item.uri;
    const isSelected = selectedItems.has(itemKey);

    return (
      <TouchableOpacity
        style={styles.gridCard}
        activeOpacity={0.8}
        onLongPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch (e) {}
          if (!isSelectionMode) {
            setIsSelectionMode(true);
            const newSet = new Set(selectedItems);
            newSet.add(itemKey);
            setSelectedItems(newSet);
          }
        }}
        onPress={() => {
          if (isSelectionMode) {
            try { Haptics.selectionAsync(); } catch (e) {}
            const newSet = new Set(selectedItems);
            if (newSet.has(itemKey)) {
              newSet.delete(itemKey);
              if (newSet.size === 0) setIsSelectionMode(false);
            } else {
              newSet.add(itemKey);
            }
            setSelectedItems(newSet);
          } else {
            try { Haptics.selectionAsync(); } catch (e) {}
            if (onSelectMedia) onSelectMedia(item, filteredMedia);
          }
        }}
      >
        {isVid ? (
          <View style={styles.videoPlaceholder}>
            {item.isDevice ? (
              <ImageItem thumbUri={thumbUri} />
            ) : (
              <Text style={styles.videoEmoji}>🎬</Text>
            )}
            <View style={styles.videoPlayBtn}>
              <Text style={styles.playArrow}>▶</Text>
            </View>
            <View style={styles.videoBadge}>
              <Text style={styles.videoBadgeText}>{item.duration ? formatDuration(item.duration) : 'VIDEO'}</Text>
            </View>
          </View>
        ) : (
          <ImageItem thumbUri={thumbUri} />
        )}

        {isGif && (
          <View style={styles.gifBadge}>
            <Text style={styles.gifText}>GIF</Text>
          </View>
        )}
        
        {isSelectionMode && (
          <View style={[styles.selectionOverlay, isSelected && styles.selectionOverlaySelected]}>
            {isSelected && (
              <View style={styles.checkCircle}>
                <Text style={styles.checkCircleText}>✓</Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  }, [serverUrl, token, filteredMedia, onSelectMedia, isSelectionMode, selectedItems]);

  const handleBatchDelete = () => {
    if (selectedItems.size === 0) return;

    if (activeSource === 'nas') {
      Alert.alert(
        'Delete from NAS',
        `Are you sure you want to permanently delete ${selectedItems.size} selected item(s) from your NAS storage? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setLoading(true);
                const pathsToDelete = Array.from(selectedItems);
                const res = await fetch(`${serverUrl}/api/files/delete`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                  },
                  body: JSON.stringify({ paths: pathsToDelete })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                  const toDeleteSet = new Set(pathsToDelete);
                  setMediaItems(prev => prev.filter(m => !toDeleteSet.has(m.path || m.uri)));
                  const cached = await cacheService.get('gallery_media_items');
                  if (Array.isArray(cached)) {
                    await cacheService.set('gallery_media_items', cached.filter(m => !toDeleteSet.has(m.path || m.uri)));
                  }
                  setSelectedItems(new Set());
                  setIsSelectionMode(false);
                  Alert.alert('Deleted', `Successfully deleted ${data.deletedCount || pathsToDelete.length} item(s) from NAS.`);
                } else {
                  Alert.alert('Delete Failed', data.error || 'Failed to delete selected files.');
                }
              } catch (err) {
                console.warn('Delete error:', err);
                Alert.alert('Error', err.message || 'Network error while deleting files.');
              } finally {
                setLoading(false);
              }
            }
          }
        ]
      );
    } else {
      Alert.alert(
        'Delete from Device',
        `Are you sure you want to delete ${selectedItems.size} photo/video item(s) from this phone?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setLoading(true);
                const assetIds = filteredMedia
                  .filter(m => selectedItems.has(m.path || m.uri) && m.id)
                  .map(m => m.id);
                if (assetIds.length > 0) {
                  await MediaLibrary.deleteAssetsAsync(assetIds);
                  const toDeleteSet = new Set(selectedItems);
                  setDeviceMediaItems(prev => prev.filter(m => !toDeleteSet.has(m.path || m.uri)));
                  setSelectedItems(new Set());
                  setIsSelectionMode(false);
                }
              } catch (err) {
                console.warn('Device delete error:', err);
                Alert.alert('Delete Error', err.message || 'Failed to delete device assets.');
              } finally {
                setLoading(false);
              }
            }
          }
        ]
      );
    }
  };

  const statusBarPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16;

  return (
    <View style={styles.container}>
      {/* ── DARK GLASS TOPBAR ─────────────────── */}
      {isSelectionMode ? (
        <View style={[styles.topbar, styles.selectionTopbar, { paddingTop: 6 }]}>
          <View style={styles.selectionTopbarInner}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setIsSelectionMode(false); setSelectedItems(new Set()); }}>
              <Text style={styles.selectionCancelText}>✕</Text>
            </TouchableOpacity>
            
            <Text style={styles.selectionCountText}>
              {selectedItems.size} selected
            </Text>
            
            <TouchableOpacity 
              onPress={() => {
                if (selectedItems.size === filteredMedia.length) {
                  setSelectedItems(new Set());
                  setIsSelectionMode(false);
                } else {
                  const allKeys = filteredMedia.map(i => i.path || i.uri);
                  setSelectedItems(new Set(allKeys));
                }
              }}
              style={styles.selectAllBtn}
            >
              <Text style={styles.selectAllBtnText}>
                {selectedItems.size === filteredMedia.length ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.selectionActionsRow}>
            {activeSource === 'device' ? (
              <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { flex: 1, backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => setUploadModalVisible(true)}
                >
                  <Text style={[styles.actionBtnText, { color: '#0F172A', fontWeight: '800' }]}>
                    📤 Upload to NAS ({selectedItems.size})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDanger, { paddingHorizontal: 14 }]}
                  activeOpacity={0.7}
                  onPress={handleBatchDelete}
                >
                  <Text style={styles.actionBtnDangerText}>🗑️ Delete</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDanger, { flex: 1 }]}
                  activeOpacity={0.7}
                  onPress={handleBatchDelete}
                >
                  <Text style={styles.actionBtnDangerText}>🗑️ Delete ({selectedItems.size})</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      ) : (
      <View style={[styles.topbar, { paddingTop: 6 }]}>
        <View style={styles.topbarInner}>
          <Text style={styles.topbarTitle}>Media Gallery</Text>
          <Text style={styles.itemCount}>
            {loading ? 'Scanning media…' : activeSource === 'device' && deviceTotalCount > 0
              ? `${deviceTotalCount.toLocaleString()} items on device`
              : `${filteredMedia.length.toLocaleString()} items`}
          </Text>
        </View>

        {/* Source Switcher Tabs (NAS Cloud vs Device Phone) */}
        <View style={styles.sourceTabRow}>
          <TouchableOpacity
            style={[styles.sourceTab, activeSource === 'nas' && styles.sourceTabActive]}
            activeOpacity={0.8}
            onPress={() => setActiveSource('nas')}
          >
            <Text style={[styles.sourceTabText, activeSource === 'nas' && styles.sourceTabTextActive]}>
              ☁️ NAS Storage
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sourceTab, activeSource === 'device' && styles.sourceTabActive]}
            activeOpacity={0.8}
            onPress={() => {
              setActiveSource('device');
              if (!hasPermission) checkPermissions();
            }}
          >
            <Text style={[styles.sourceTabText, activeSource === 'device' && styles.sourceTabTextActive]}>
              📱 Phone Gallery
            </Text>
          </TouchableOpacity>
        </View>

        {/* Device View Mode Toggle (All Photos / Albums) */}
        {activeSource === 'device' && (
          <View style={styles.deviceViewToggleRow}>
            <TouchableOpacity
              style={[styles.deviceViewPill, deviceViewMode === 'all' && styles.deviceViewPillActive]}
              onPress={() => { setDeviceViewMode('all'); setSelectedAlbum(null); }}
            >
              <Text style={[styles.deviceViewPillText, deviceViewMode === 'all' && styles.deviceViewPillTextActive]}>📷 All Photos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deviceViewPill, deviceViewMode === 'albums' && styles.deviceViewPillActive]}
              onPress={() => { setDeviceViewMode('albums'); loadAlbums(); }}
            >
              <Text style={[styles.deviceViewPillText, deviceViewMode === 'albums' && styles.deviceViewPillTextActive]}>📁 Albums</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TRIPLE DROPDOWN SELECT PICKERS */}
        <View style={styles.dropdownRow}>
          {/* Storage Disk Dropdown (when NAS active) */}
          {activeSource === 'nas' && (
            <View style={styles.dropdownPickerWrap}>
              <Text style={styles.dropdownLabel}>STORAGE DISK</Text>
              <TouchableOpacity
                style={styles.dropdownSelectBtn}
                activeOpacity={0.8}
                onPress={() => setShowDriveModal(true)}
              >
                <Text style={styles.dropdownSelectBtnText} numberOfLines={1}>
                  {driveFilter === 'ALL' ? '💽 All Drives' : `💾 Drive ${driveFilter}`}
                </Text>
                <Text style={styles.dropdownChevron}>▼</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Media Type Dropdown */}
          <View style={styles.dropdownPickerWrap}>
            <Text style={styles.dropdownLabel}>MEDIA TYPE</Text>
            <TouchableOpacity
              style={styles.dropdownSelectBtn}
              activeOpacity={0.8}
              onPress={() => setShowCatModal(true)}
            >
              <Text style={styles.dropdownSelectBtnText} numberOfLines={1}>
                {filterMode === 'photos' ? '🖼️ Photos' : filterMode === 'videos' ? '🎬 Videos' : 'All Media'}
              </Text>
              <Text style={styles.dropdownChevron}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Extension Filter Dropdown */}
          <View style={styles.dropdownPickerWrap}>
            <Text style={styles.dropdownLabel}>FORMAT EXTENSION</Text>
            <TouchableOpacity
              style={styles.dropdownSelectBtn}
              activeOpacity={0.8}
              onPress={() => setShowExtModal(true)}
            >
              <Text style={styles.dropdownSelectBtnText} numberOfLines={1}>
                {extFilter === 'ALL' ? 'All (.ALL)' : extFilter}
              </Text>
              <Text style={styles.dropdownChevron}>▼</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      )}

      {/* Permission Card (If Permission Not Granted for Phone Media) */}
      {hasPermission === false && (
        <View style={styles.permissionCard}>
          <Text style={styles.permIcon}>🖼️🎬</Text>
          <Text style={styles.permTitle}>Phone Photos & Videos Permission</Text>
          <Text style={styles.permText}>
            Personal NAS requires permission to access your phone gallery to view local photos & videos and auto-sync them to your NAS drives.
          </Text>
          <TouchableOpacity style={styles.grantBtn} activeOpacity={0.8} onPress={handleGrantPermission}>
            <Text style={styles.grantBtnText}>Grant Media Permission</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ALBUM GRID VIEW */}
      {activeSource === 'device' && deviceViewMode === 'albums' && !selectedAlbum && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {albums.map(album => (
              <TouchableOpacity
                key={album.id}
                style={styles.albumCard}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedAlbum(album);
                  setDeviceViewMode('all');
                  setDeviceEndCursor(null);
                  setDeviceHasNextPage(true);
                  setDeviceMediaItems([]);
                  setLoading(true);
                  // Will trigger loadDeviceMedia via useEffect
                }}
              >
                {album.coverUri ? (
                  <Image source={{ uri: album.coverUri }} style={styles.albumCover} contentFit="cover" />
                ) : (
                  <View style={[styles.albumCover, { backgroundColor: colors.inputBg, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 28 }}>📁</Text>
                  </View>
                )}
                <Text style={styles.albumName} numberOfLines={1}>{album.title || 'Unknown'}</Text>
                <Text style={styles.albumCount}>{album.assetCount} items</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── MEDIA GRID ───────────────────────────────────────────── */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading {activeSource === 'nas' ? 'NAS' : 'Phone'} media...</Text>
        </View>
      ) : filteredMedia.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>{activeSource === 'device' ? '📱' : '🖼️'}</Text>
          <Text style={styles.emptyTitle}>
            No {filterMode === 'photos' ? 'Photos' : filterMode === 'videos' ? 'Videos' : 'Media'} Found
          </Text>
          <Text style={styles.emptyText}>
            {activeSource === 'device'
              ? 'No photos or videos found on your phone or media permission is limited.'
              : 'No media detected on your configured NAS drives.'}
          </Text>
          {activeSource === 'device' && (
            <TouchableOpacity style={[styles.grantBtn, { marginTop: 16 }]} activeOpacity={0.8} onPress={pickCustomDeviceMedia}>
              <Text style={styles.grantBtnText}>📸 Pick Photos / Videos</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlashList
          data={filteredMedia}
          extraData={{ isSelectionMode, selectedItems, deviceViewMode }}
          keyExtractor={(item, index) => item.isSectionHeader ? `header-${item.dateKey}` : (item.id || item.path || item.uri || index.toString())}
          numColumns={3}
          estimatedItemSize={COLUMN_WIDTH + GAP}
          renderItem={renderMediaItem}
          getItemType={(item) => item.isSectionHeader ? 'sectionHeader' : 'row'}
          contentContainerStyle={styles.gridContainer}
          onEndReached={activeSource === 'nas' ? loadMoreMedia : () => loadDeviceMedia(true)}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        />
      )}

      {/* FLOATING SYNC TO NAS BUTTON */}
      {activeSource === 'device' && !isSelectionMode && !isBatchUploading && filteredMedia.length > 0 && deviceViewMode === 'all' && (
        <TouchableOpacity
          style={[styles.syncFab, { backgroundColor: colors.accent }]}
          activeOpacity={0.85}
          onPress={() => {
            const mediaOnly = filteredMedia.filter(i => !i.isSectionHeader);
            const allKeys = mediaOnly.map(i => i.path || i.uri);
            setSelectedItems(new Set(allKeys));
            setIsSelectionMode(true);
            setUploadModalVisible(true);
          }}
        >
          <Text style={styles.syncFabText}>🔄 Sync to NAS</Text>
        </TouchableOpacity>
      )}

      {/* CATEGORY PICKER MODAL */}
      <Modal visible={showCatModal} animationType="fade" transparent={true} onRequestClose={() => setShowCatModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCatModal(false)}>
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>Select Media Type</Text>
            {[
              { key: 'all', label: 'All Media (Photos & Videos)', icon: '🎬🖼️' },
              { key: 'photos', label: 'Photos Only', icon: '🖼️' },
              { key: 'videos', label: 'Videos Only', icon: '🎬' },
            ].map(item => (
              <TouchableOpacity
                key={item.key}
                style={[styles.pickerItem, filterMode === item.key && styles.pickerItemActive]}
                onPress={() => {
                  setFilterMode(item.key);
                  setShowCatModal(false);
                }}
              >
                <Text style={styles.pickerItemText}>{item.icon} {item.label}</Text>
                {filterMode === item.key && <Text style={styles.checkIcon}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* EXTENSION PICKER MODAL */}
      <Modal visible={showExtModal} animationType="fade" transparent={true} onRequestClose={() => setShowExtModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowExtModal(false)}>
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>Filter by Extension</Text>
            {['ALL', '.JPG', '.PNG', '.WEBP', '.MP4', '.MKV', '.GIF'].map(ext => (
              <TouchableOpacity
                key={ext}
                style={[styles.pickerItem, extFilter === ext && styles.pickerItemActive]}
                onPress={() => {
                  setExtFilter(ext);
                  setShowExtModal(false);
                }}
              >
                <Text style={styles.pickerItemText}>{ext === 'ALL' ? 'All Extensions (.ALL)' : ext}</Text>
                {extFilter === ext && <Text style={styles.checkIcon}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* DRIVE PICKER MODAL */}
      <Modal visible={showDriveModal} animationType="fade" transparent={true} onRequestClose={() => setShowDriveModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDriveModal(false)}>
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>Select Storage Disk</Text>
            
            <TouchableOpacity
              style={[styles.pickerItem, driveFilter === 'ALL' && styles.pickerItemActive]}
              onPress={() => {
                handleDriveFilterChange('ALL');
                setShowDriveModal(false);
              }}
            >
              <Text style={styles.pickerItemText}>💽 All NAS Drives</Text>
              {driveFilter === 'ALL' && <Text style={styles.checkIcon}>✓</Text>}
            </TouchableOpacity>

            {availableDrives.map(d => {
              const letter = d.letter || d;
              const isSelected = driveFilter === letter;
              return (
                <TouchableOpacity
                  key={letter}
                  style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                  onPress={() => {
                    handleDriveFilterChange(letter);
                    setShowDriveModal(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>
                    💾 {d.name ? `${d.name} (${letter})` : `Drive ${letter}`}
                  </Text>
                  {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* TARGET UPLOAD LOCATION SELECTOR MODAL */}
      <Modal visible={uploadModalVisible} animationType="slide" transparent={true} onRequestClose={() => setUploadModalVisible(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.targetModalCard, { backgroundColor: colors.surfaceSolid, borderColor: colors.borderLight }]}>
            <View style={styles.targetModalHeader}>
              <Text style={[styles.targetModalTitle, { color: colors.textPrimary }]}>
                📤 Upload {selectedItems.size} Selected Items to NAS
              </Text>
              <TouchableOpacity onPress={() => setUploadModalVisible(false)}>
                <Text style={{ color: colors.textMuted, fontSize: 18, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {/* Target Storage Disk Selector */}
              <Text style={[styles.fieldLabel, { color: colors.accent, marginTop: 8 }]}>SELECT TARGET STORAGE DISK</Text>
              <View style={styles.drivePillRow}>
                {availableDrives.map(d => {
                  const letter = d.letter || d;
                  const isSelected = targetDrive === letter;
                  return (
                    <TouchableOpacity
                      key={letter}
                      style={[styles.drivePill, isSelected && styles.drivePillActive]}
                      onPress={() => {
                        setTargetDrive(letter);
                        setTargetFolder(`${letter}:\\MobileUploads`);
                      }}
                    >
                      <Text style={[styles.drivePillText, isSelected && styles.drivePillTextActive]}>
                        💾 {d.name ? `${d.name} (${letter})` : `Drive ${letter}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Target Folder Path */}
              <Text style={[styles.fieldLabel, { color: colors.accent, marginTop: 16 }]}>TARGET FOLDER PATH</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.folderInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.accentBorder }]}
                  value={targetFolder}
                  onChangeText={setTargetFolder}
                  placeholder="e.g. D:\Backups\MobileUploads"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={[styles.browseBtn, { backgroundColor: colors.accentBg, borderColor: colors.accent }]}
                  onPress={() => setFolderExplorerVisible(true)}
                >
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>📁 Browse</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 6, fontStyle: 'italic' }}>
                Files will be saved to your selected NAS storage drive and folder.
              </Text>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.borderLight }]}
                onPress={() => setUploadModalVisible(false)}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.accent }]}
                onPress={() => {
                  const itemsToUpload = filteredMedia.filter(i => selectedItems.has(i.path || i.uri));
                  startBatchUpload(itemsToUpload.length > 0 ? itemsToUpload : Array.from(selectedItems).map(u => ({ uri: u, path: u })), targetFolder);
                }}
              >
                <Text style={{ color: '#0F172A', fontWeight: '800', fontSize: 14 }}>
                  🚀 Start Upload ({selectedItems.size})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* FILE EXPLORER MODAL FOR FOLDER BROWSER */}
      <FileExplorerModal
        visible={folderExplorerVisible}
        initialPath={targetFolder || (targetDrive ? `${targetDrive}:\\` : 'C:\\')}
        serverUrl={serverUrl}
        token={token}
        mode="selectFolder"
        onClose={() => setFolderExplorerVisible(false)}
        onSelectFolder={(selectedPath) => {
          setTargetFolder(selectedPath);
        }}
      />

      {/* BATCH UPLOAD PROGRESS MODAL */}
      <Modal visible={isBatchUploading} animationType="fade" transparent={true} onRequestClose={() => {}}>
        <View style={styles.modalBg}>
          <View style={[styles.progressCard, { backgroundColor: colors.surfaceSolid, borderColor: colors.accent }]}>
            <ActivityIndicator size="large" color={colors.accent} style={{ marginBottom: 12 }} />
            <Text style={[styles.progressTitle, { color: colors.textPrimary }]}>Uploading to NAS Server...</Text>
            <Text style={[styles.progressSubtitle, { color: colors.accent, fontWeight: '700' }]}>
              Item {uploadProgress.current} of {uploadProgress.total}
            </Text>
            <Text style={[styles.progressFileName, { color: colors.textSecondary }]} numberOfLines={1}>
              {uploadProgress.fileName}
            </Text>

            {/* Progress Bar */}
            <View style={[styles.progressBarTrack, { backgroundColor: colors.inputBg }]}>
              <View style={[styles.progressBarFill, { width: `${uploadProgress.percent}%`, backgroundColor: colors.accent }]} />
            </View>

            <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 6 }}>
              {uploadProgress.percent}% Complete
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // DUAL DROPDOWN ROW
  dropdownRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dropdownPickerWrap: {
    flex: 1,
  },
  dropdownLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dropdownSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dropdownSelectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  dropdownChevron: {
    fontSize: 10,
    color: colors.accent,
    marginLeft: 6,
  },

  // PICKER MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    elevation: 10,
  },
  pickerModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: colors.surface,
  },
  pickerItemActive: {
    backgroundColor: colors.accentBg,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  pickerItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  checkIcon: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.accent,
  },

  // TOPBAR
  topbar: {
    backgroundColor: colors.topbar,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topbarInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  topbarTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  itemCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },

  // SOURCE TABS
  sourceTabRow: {
    flexDirection: 'row',
    backgroundColor: colors.tabBg,
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
  },
  sourceTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  sourceTabActive: {
    backgroundColor: colors.accent,
  },
  sourceTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sourceTabTextActive: {
    color: colors.background,
  },

  // FILTER PILLS
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.tabBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.accentBg,
    borderColor: colors.accent,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.accentLight,
    fontWeight: '700',
  },

  // PERMISSION CARD
  permissionCard: {
    margin: 16,
    padding: 20,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
  },
  permIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  permTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  permText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  grantBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  grantBtnText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 14,
  },

  // GRID
  gridContainer: {
    padding: GAP,
  },
  gridCard: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH,
    margin: GAP / 2,
    backgroundColor: colors.surfaceSolid,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },

  // VIDEO PLACEHOLDER
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoEmoji: {
    fontSize: 28,
    opacity: 0.6,
  },
  videoPlayBtn: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playArrow: {
    color: colors.background,
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  videoBadgeText: {
    color: colors.accentLight,
    fontSize: 9,
    fontWeight: '800',
  },

  // GIF BADGE
  gifBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  gifText: {
    color: colors.background,
    fontSize: 9,
    fontWeight: '900',
  },

  // MULTISELECT
  selectionOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 8,
  },
  selectionOverlaySelected: {
    backgroundColor: colors.accentBg,
    borderColor: colors.accent,
  },
  checkCircle: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  selectionTopbar: {
    backgroundColor: colors.surfaceSolid,
    paddingBottom: 16,
  },
  selectionTopbarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cancelBtn: {
    padding: 8,
    marginLeft: -8,
  },
  selectionCancelText: {
    fontSize: 20,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  selectionCountText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  selectAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.accentBg,
    borderRadius: 8,
  },
  selectAllBtnText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  selectionActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.inputBg,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  actionBtnText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  actionBtnDangerText: {
    color: colors.danger,
    fontWeight: '600',
    fontSize: 14,
  },

  // DISK PILLS
  drivePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginRight: 8,
  },
  drivePillActive: {
    backgroundColor: colors.accentBg,
    borderColor: colors.accent,
  },
  drivePillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  drivePillTextActive: {
    color: colors.accent,
    fontWeight: 'bold',
  },

  // STATES
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },

  // TARGET UPLOAD MODAL & PROGRESS
  targetModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  targetModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  targetModalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  folderInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    borderWidth: 1,
  },
  browseBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  progressCard: {
    width: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  progressSubtitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  progressFileName: {
    fontSize: 12,
    marginBottom: 16,
    maxWidth: 260,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  // SECTION HEADERS
  sectionHeader: {
    width: width,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionHeaderCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },

  // DEVICE VIEW TOGGLE
  deviceViewToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  deviceViewPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  deviceViewPillActive: {
    backgroundColor: colors.accentBg,
    borderColor: colors.accent,
  },
  deviceViewPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  deviceViewPillTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },

  // ALBUM CARDS
  albumCard: {
    width: (width - 34) / 2,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginBottom: 4,
  },
  albumCover: {
    width: '100%',
    height: (width - 34) / 2,
    borderRadius: 12,
  },
  albumName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 6,
    paddingHorizontal: 6,
  },
  albumCount: {
    fontSize: 11,
    color: colors.textMuted,
    paddingHorizontal: 6,
    paddingBottom: 8,
  },

  // SYNC FAB
  syncFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 28,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    zIndex: 100,
  },
  syncFabText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
});
