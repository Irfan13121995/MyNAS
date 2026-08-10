import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, StatusBar
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function FileExplorerModal({ visible, initialPath, serverUrl, token, onClose, onFilePress }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (visible && initialPath) {
      let clean = initialPath.replace(/::+/g, ':').trim();
      if (/^[a-zA-Z]:?$/.test(clean)) {
        clean = clean.replace(':', '') + ':\\';
      }
      setCurrentPath(clean);
    }
  }, [visible, initialPath]);

  useEffect(() => {
    if (visible && currentPath) {
      fetchFiles();
    }
  }, [currentPath, visible]);

  const fetchFiles = async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/files?path=${encodeURIComponent(currentPath)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data || []);
      }
    } catch (err) {
      console.warn('Failed to fetch files:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchFiles();
  };

  const handleUp = () => {
    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      const newPath = currentPath.includes('\\') ? parts.join('\\') + '\\' : parts.join('/');
      setCurrentPath(newPath);
    } else {
      // already at root, maybe close or go to drive list
    }
  };

  const handleItemPress = (item) => {
    if (item.isDirectory) {
      setCurrentPath(item.path);
    } else {
      onFilePress && onFilePress(item, items);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const renderItem = ({ item }) => {
    const isDir = item.isDirectory;
    const icon = isDir ? '📁' : '📄';
    const dateStr = item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString() : '';

    return (
      <TouchableOpacity style={styles.itemRow} onPress={() => handleItemPress(item)}>
        <Text style={styles.itemIcon}>{icon}</Text>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemMeta}>
            {!isDir && `${formatBytes(item.size)} • `}{dateStr}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16 }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleUp} style={styles.backBtn}>
              <Text style={styles.backText}>⬆ Back</Text>
            </TouchableOpacity>
            <View style={styles.pathContainer}>
              <Text style={styles.pathText} numberOfLines={1} ellipsizeMode="head">
                {currentPath}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading && !refreshing ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item, index) => item.path || index.toString()}
              renderItem={renderItem}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>Folder is empty</Text>
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
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  container: {
    flex: 0.9,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.topbar,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: 8,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  backText: {
    color: colors.accent,
    fontWeight: 'bold',
  },
  pathContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  pathText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  closeBtn: {
    padding: 8,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 16,
  },
});
