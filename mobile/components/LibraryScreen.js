import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions, Alert, Platform, StatusBar, ScrollView, Modal
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { requestMediaPermissions } from '../services/syncService';
import { cacheService } from '../services/cacheService';

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

const ImageItem = React.memo(({ thumbUri }) => {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <View style={[styles.thumbnail, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B' }]}>
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

export default function LibraryScreen({ serverUrl, token, initialFilter = 'all', onSelectMedia }) {
  const [activeSource, setActiveSource] = useState('nas'); // 'nas' | 'device'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [deviceMediaItems, setDeviceMediaItems] = useState([]);
  const [hasPermission, setHasPermission] = useState(null);
  const [filterMode, setFilterMode] = useState(initialFilter);
  const [extFilter, setExtFilter] = useState('ALL');
  const [showCatModal, setShowCatModal] = useState(false);
  const [showExtModal, setShowExtModal] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

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

  const fetchGallery = async () => {
    // Stale-While-Revalidate: Load from local cache instantly first
    const cached = await cacheService.get('gallery_media_items');
    if (cached && cached.length > 0) {
      setMediaItems(cached);
      setLoading(false);
    }

    try {
      const res = await fetch(`${serverUrl}/api/gallery?page=1&limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMediaItems(data.items || []);
        setPage(data.page || 1);
        setHasMore(data.hasMore ?? false);
        await cacheService.set('gallery_media_items', data.items || []);
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
      const res = await fetch(`${serverUrl}/api/gallery?page=${nextPage}&limit=100`, {
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

  const loadDeviceMedia = async () => {
    setLoading(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setHasPermission(perm.granted);
      if (!perm.granted) {
        setLoading(false);
        return;
      }

      // Launch media picker or get user selected assets
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
        setDeviceMediaItems(mapped);
      }
    } catch (err) {
      console.warn('Failed to load device media:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
  }, [activeSource]);

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
    return activeMediaList.filter(item => {
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
  }, [activeMediaList, filterMode, extFilter]);

  const renderMediaItem = useCallback(({ item }) => {
    const thumbUri = item.isDevice
      ? item.uri
      : `${serverUrl}/api/thumbnail?path=${encodeURIComponent(item.path)}&token=${token}`;
    const isVid = isVideoFile(item);
    const ext = normalizeExt(item);
    const isGif = ext === '.gif';

    return (
      <TouchableOpacity
        style={styles.gridCard}
        activeOpacity={0.8}
        onPress={() => {
          try { Haptics.selectionAsync(); } catch (e) {}
          if (onSelectMedia) onSelectMedia(item, filteredMedia);
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
              <Text style={styles.videoBadgeText}>VIDEO</Text>
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
      </TouchableOpacity>
    );
  }, [serverUrl, token, filteredMedia, onSelectMedia]);

  const statusBarPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16;

  return (
    <View style={styles.container}>
      {/* ── DARK GLASS TOPBAR (SAFE FROM STATUS BAR) ─────────────────── */}
      <View style={[styles.topbar, { paddingTop: statusBarPadding }]}>
        <View style={styles.topbarInner}>
          <Text style={styles.topbarTitle}>Media Gallery</Text>
          <Text style={styles.itemCount}>
            {loading ? 'Scanning media…' : `${filteredMedia.length.toLocaleString()} items`}
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

        {/* DUAL DROPDOWN SELECT PICKERS */}
        <View style={styles.dropdownRow}>
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
                {extFilter === 'ALL' ? 'All Types (.ALL)' : extFilter}
              </Text>
              <Text style={styles.dropdownChevron}>▼</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

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

      {/* ── MEDIA GRID ───────────────────────────────────────────── */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00BCD4" />
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
              ? 'Tap "📱 Phone Gallery" or refresh to select device photos and videos.'
              : 'No media detected on your configured NAS drives.'}
          </Text>
          {activeSource === 'device' && (
            <TouchableOpacity style={[styles.grantBtn, { marginTop: 16 }]} activeOpacity={0.8} onPress={loadDeviceMedia}>
              <Text style={styles.grantBtnText}>📸 Choose Photos / Videos</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlashList
          data={filteredMedia}
          keyExtractor={(item, index) => item.path || item.uri || index.toString()}
          numColumns={3}
          estimatedItemSize={COLUMN_WIDTH + GAP}
          renderItem={renderMediaItem}
          contentContainerStyle={styles.gridContainer}
          onEndReached={loadMoreMedia}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00BCD4" />
          }
        />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
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
    color: '#00BCD4',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dropdownSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(0, 188, 212, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dropdownSelectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
  },
  dropdownChevron: {
    fontSize: 10,
    color: '#00BCD4',
    marginLeft: 6,
  },

  // PICKER MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 10, 15, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 188, 212, 0.4)',
    elevation: 10,
  },
  pickerModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
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
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  pickerItemActive: {
    backgroundColor: 'rgba(0, 188, 212, 0.18)',
    borderWidth: 1,
    borderColor: '#00BCD4',
  },
  pickerItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  checkIcon: {
    fontSize: 16,
    fontWeight: '900',
    color: '#00BCD4',
  },

  // TOPBAR
  topbar: {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  itemCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00BCD4',
  },

  // SOURCE TABS
  sourceTabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
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
    backgroundColor: '#00BCD4',
  },
  sourceTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  sourceTabTextActive: {
    color: '#0B0F17',
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
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(0, 188, 212, 0.2)',
    borderColor: '#00BCD4',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  filterPillTextActive: {
    color: '#22D3EE',
    fontWeight: '700',
  },

  // PERMISSION CARD
  permissionCard: {
    margin: 16,
    padding: 20,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 188, 212, 0.4)',
    alignItems: 'center',
  },
  permIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  permTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
    textAlign: 'center',
  },
  permText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  grantBtn: {
    backgroundColor: '#00BCD4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  grantBtnText: {
    color: '#0B0F17',
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
    backgroundColor: '#1E293B',
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
    backgroundColor: '#0F172A',
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
    backgroundColor: 'rgba(0, 188, 212, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playArrow: {
    color: '#0F172A',
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
    color: '#22D3EE',
    fontSize: 9,
    fontWeight: '800',
  },

  // GIF BADGE
  gifBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#00BCD4',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  gifText: {
    color: '#0F172A',
    fontSize: 9,
    fontWeight: '900',
  },

  // STATES
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
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
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
});
