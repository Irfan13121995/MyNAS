import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, StatusBar, Alert
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useTheme } from '../contexts/ThemeContext';

export default function RecycleBinModal({
  visible,
  serverUrl,
  token,
  onClose,
  isReadonly = false,
  onItemRestored
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);

  const fetchTrash = useCallback(async () => {
    if (!serverUrl || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/trash`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Failed to fetch trash:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverUrl, token]);

  useEffect(() => {
    if (visible) {
      fetchTrash();
    }
  }, [visible, fetchTrash]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTrash();
  };

  const handleRestore = async (item) => {
    if (actionInProgress) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}

    setActionInProgress(item.id);
    try {
      const res = await fetch(`${serverUrl}/api/trash/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id: item.id })
      });
      const data = await res.json();
      if (res.ok) {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
        setItems(prev => prev.filter(i => i.id !== item.id));
        onItemRestored && onItemRestored(item);
      } else {
        Alert.alert('Restore Failed', data.error || 'Could not restore file.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Network error while restoring.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handlePurge = async (item) => {
    if (actionInProgress) return;
    Alert.alert(
      'Permanent Deletion',
      `Permanently delete "${item.fileName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch (e) {}
            setActionInProgress(item.id);
            try {
              const res = await fetch(`${serverUrl}/api/trash/purge?id=${encodeURIComponent(item.id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                setItems(prev => prev.filter(i => i.id !== item.id));
              } else {
                const data = await res.json();
                Alert.alert('Delete Failed', data.error || 'Could not delete item.');
              }
            } catch (err) {
              Alert.alert('Error', err.message || 'Network error while deleting.');
            } finally {
              setActionInProgress(null);
            }
          }
        }
      ]
    );
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const renderItem = ({ item }) => {
    const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(item.fileName || '');
    const isBusy = actionInProgress === item.id;
    const deletedDate = item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : '';

    return (
      <View style={styles.itemCard}>
        <View style={styles.itemLeft}>
          {isImage ? (
            <Image
              source={{ uri: `${serverUrl}/api/thumbnail?path=${encodeURIComponent(item.trashPath || item.originalPath)}&token=${token}` }}
              style={styles.thumbnail}
              contentFit="cover"
              transition={120}
              placeholder={require('../assets/icon.png')}
            />
          ) : (
            <View style={styles.iconBox}>
              <Text style={{ fontSize: 24 }}>📄</Text>
            </View>
          )}

          <View style={styles.itemMeta}>
            <Text style={styles.itemName} numberOfLines={1}>{item.fileName}</Text>
            <Text style={styles.itemPath} numberOfLines={1}>{item.originalPath}</Text>
            <Text style={styles.itemSub}>{formatBytes(item.size)} • Deleted {deletedDate}</Text>
          </View>
        </View>

        <View style={styles.itemActions}>
          {isBusy ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.restoreBtn]}
                onPress={() => handleRestore(item)}
              >
                <Text style={styles.restoreText}>Restore</Text>
              </TouchableOpacity>

              {!isReadonly && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.purgeBtn]}
                  onPress={() => handlePurge(item)}
                >
                  <Text style={styles.purgeText}>✕</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>🗑️ Recycle Bin</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{items.length}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          {loading && !refreshing ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Loading trash...</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={{ fontSize: 44, marginBottom: 12 }}>🗑️</Text>
                  <Text style={styles.emptyTitle}>Recycle Bin is Empty</Text>
                  <Text style={styles.emptySub}>Deleted items are temporarily preserved here for safe recovery.</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors) => StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.topbar,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: colors.accentBg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceElevated || colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  closeText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textSecondary,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline || colors.border,
    marginBottom: 10,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.surfaceSolid,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated || colors.surfaceSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMeta: {
    marginLeft: 12,
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemPath: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemSub: {
    fontSize: 11,
    color: colors.accent,
    marginTop: 3,
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreBtn: {
    backgroundColor: colors.accentBg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  restoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  purgeBtn: {
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
    paddingHorizontal: 10,
  },
  purgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
