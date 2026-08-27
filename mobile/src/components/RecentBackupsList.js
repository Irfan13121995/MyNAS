/**
 * List of Recently Backed-up and Pending Files
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useSync } from '../contexts/SyncContext';
import { getRecentlySyncedFiles } from '../database/fileRepository';
import GlassCard from './GlassCard';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function RecentBackupsList() {
  const { theme } = useTheme();
  const { isSyncing } = useSync();
  const [recentFiles, setRecentFiles] = useState([]);

  const loadRecent = async () => {
    try {
      const files = await getRecentlySyncedFiles(15);
      setRecentFiles(files);
    } catch (e) {}
  };

  useEffect(() => {
    loadRecent();
  }, [isSyncing]);

  const renderItem = ({ item }) => {
    const isVideo = item.media_type === 'video';
    const dateStr = item.last_synced_at 
      ? new Date(item.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Recently';

    return (
      <View style={[styles.itemRow, { borderBottomColor: theme.glassBorder }]}>
        <View style={[styles.thumbBox, { backgroundColor: theme.glassInput }]}>
          {item.local_uri ? (
            <Image source={{ uri: item.local_uri }} style={styles.thumb} />
          ) : (
            <Text style={{ fontSize: 18 }}>{isVideo ? '🎬' : '📷'}</Text>
          )}
        </View>
        <View style={styles.itemInfo}>
          <Text style={[styles.fileName, { color: theme.textPrimary }]} numberOfLines={1}>
            {item.filename}
          </Text>
          <Text style={[styles.fileMeta, { color: theme.textSecondary }]}>
            {formatBytes(item.file_size)} • {dateStr}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.successBg }]}>
          <Text style={[styles.badgeText, { color: theme.success }]}>SYNCED</Text>
        </View>
      </View>
    );
  };

  return (
    <GlassCard style={{ marginTop: 8 }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Recently Backed Up</Text>
        <Text style={[styles.count, { color: theme.accent }]}>{recentFiles.length} items</Text>
      </View>

      {recentFiles.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>☁️</Text>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            No backed-up files yet. Click "Scan & Backup" to begin.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recentFiles}
          keyExtractor={(item) => item.asset_id || String(item.id)}
          renderItem={renderItem}
          scrollEnabled={false}
        />
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  thumbBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  itemInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  fileMeta: {
    fontSize: 11,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 12,
    textAlign: 'center',
  }
});
