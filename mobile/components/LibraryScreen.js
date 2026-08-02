import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, FlatList, Image, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions, Alert, Platform, StatusBar
} from 'react-native';

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
  if (item.isVideo) return true;
  return VIDEO_EXTS.has(normalizeExt(item));
}

export default function LibraryScreen({ serverUrl, token, initialFilter = 'all', onSelectMedia }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [filterMode, setFilterMode] = useState(initialFilter);

  useEffect(() => {
    if (initialFilter) {
      setFilterMode(initialFilter);
    }
  }, [initialFilter]);

  const fetchGallery = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/gallery`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMediaItems(data || []);
      }
    } catch (err) {
      console.warn('Failed to fetch gallery media:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGallery();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchGallery();
  };

  const filteredMedia = mediaItems.filter(item => {
    const isVid = isVideoFile(item);
    if (filterMode === 'videos') return isVid;
    if (filterMode === 'photos') return !isVid;
    return true;
  });

  const renderMediaItem = ({ item }) => {
    const thumbUri = `${serverUrl}/api/thumbnail?path=${encodeURIComponent(item.path)}&token=${token}`;
    const isVid = isVideoFile(item);
    const ext = normalizeExt(item);
    const isGif = ext === '.gif';

    return (
      <TouchableOpacity
        style={styles.gridCard}
        activeOpacity={0.8}
        onPress={() => onSelectMedia && onSelectMedia(item, filteredMedia)}
      >
        {isVid ? (
          <View style={styles.videoPlaceholder}>
            <Text style={styles.videoEmoji}>🎬</Text>
            <View style={styles.videoPlayBtn}>
              <Text style={styles.playArrow}>▶</Text>
            </View>
            <View style={styles.videoBadge}>
              <Text style={styles.videoBadgeText}>VIDEO</Text>
            </View>
          </View>
        ) : (
          <Image
            source={{ uri: thumbUri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        )}

        {isGif && (
          <View style={styles.gifBadge}>
            <Text style={styles.gifText}>GIF</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const statusBarPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16;

  return (
    <View style={styles.container}>
      {/* ── DARK GLASS TOPBAR (SAFE FROM STATUS BAR) ─────────────────── */}
      <View style={[styles.topbar, { paddingTop: statusBarPadding }]}>
        <View style={styles.topbarInner}>
          <Text style={styles.topbarTitle}>Library</Text>
          <Text style={styles.itemCount}>
            {loading ? 'Scanning media…' : `${filteredMedia.length.toLocaleString()} items`}
          </Text>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'All', icon: '' },
            { key: 'photos', label: 'Photos', icon: ' 🖼️' },
            { key: 'videos', label: 'Videos', icon: ' 🎬' },
          ].map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, filterMode === f.key && styles.filterPillActive]}
              activeOpacity={0.7}
              onPress={() => setFilterMode(f.key)}
            >
              <Text style={[
                styles.filterPillText,
                filterMode === f.key && styles.filterPillTextActive
              ]}>
                {f.label}{f.icon}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── MEDIA GRID ──────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingBox}>
          <View style={styles.loadingGlass}>
            <ActivityIndicator size="large" color="#00BCD4" />
            <Text style={styles.loadingText}>Loading Media Library…</Text>
          </View>
        </View>
      ) : filteredMedia.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyGlass}>
            <Text style={styles.emptyIcon}>{filterMode === 'videos' ? '🎬' : '🖼️'}</Text>
            <Text style={styles.emptyTitle}>
              No {filterMode === 'videos' ? 'Videos' : filterMode === 'photos' ? 'Photos' : 'Media'} Found
            </Text>
            <Text style={styles.emptySub}>
              Upload {filterMode === 'videos' ? 'videos' : 'photos'} to your NAS drives to see them here.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredMedia}
          keyExtractor={(item, index) => item.path || index.toString()}
          numColumns={3}
          renderItem={renderMediaItem}
          contentContainerStyle={styles.gridContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00BCD4" />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },

  /* ── Dark Glass Topbar ─── */
  topbar: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  topbarInner: {
    marginBottom: 12,
  },
  topbarTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  itemCount: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 3,
    fontWeight: '500',
  },

  /* ── Filter Pills ─── */
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(0, 188, 212, 0.2)',
    borderColor: '#00BCD4',
    elevation: 3,
    shadowColor: '#00BCD4',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  filterPillTextActive: {
    color: '#22D3EE',
    fontWeight: '800',
  },

  /* ── Media Grid ─── */
  gridContainer: {
    padding: GAP,
    paddingBottom: 110,
  },
  gridCard: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH,
    margin: GAP / 2,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    position: 'relative',
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },

  /* ── Video Card ─── */
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  videoEmoji: {
    fontSize: 30,
    opacity: 0.6,
  },
  videoPlayBtn: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#00BCD4',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  playArrow: {
    color: '#0F172A',
    fontSize: 11,
    marginLeft: 1,
    fontWeight: '800',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  videoBadgeText: {
    color: '#38BDF8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* ── GIF Badge ─── */
  gifBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gifText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  /* ── Loading State ─── */
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingGlass: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 24,
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 4,
  },
  loadingText: {
    marginTop: 14,
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },

  /* ── Empty State ─── */
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyGlass: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 24,
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 4,
    maxWidth: 320,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 21,
    fontWeight: '400',
  },
});
