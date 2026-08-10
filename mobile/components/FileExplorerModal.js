import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, StatusBar, Alert, TextInput
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function FileExplorerModal({ 
  visible, 
  initialPath, 
  serverUrl, 
  token, 
  onClose, 
  onFilePress, 
  mode = 'view', // 'view' | 'selectFolder'
  onSelectFolder 
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // New folder dialog state
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

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
    }
  };

  const handleItemPress = (item) => {
    if (item.isDirectory) {
      setCurrentPath(item.path);
    } else {
      onFilePress && onFilePress(item, items);
    }
  };

  const handleCreateNewFolder = async () => {
    if (!newFolderName || !newFolderName.trim()) {
      Alert.alert('Error', 'Please enter a valid folder name');
      return;
    }

    const folderPath = currentPath.endsWith('\\') || currentPath.endsWith('/') 
      ? `${currentPath}${newFolderName.trim()}`
      : `${currentPath}\\${newFolderName.trim()}`;

    setCreatingFolder(true);
    try {
      const res = await fetch(`${serverUrl}/api/files/mkdir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ path: folderPath })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewFolderName('');
        setNewFolderModalVisible(false);
        fetchFiles();
      } else {
        Alert.alert('Create Folder Failed', data.error || 'Could not create folder on server.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Network error creating folder.');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleConfirmSelectFolder = () => {
    if (onSelectFolder) {
      onSelectFolder(currentPath);
    }
    onClose();
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
            {isDir ? 'Folder' : `${formatBytes(item.size)} • ${dateStr}`}
          </Text>
        </View>
        {isDir && <Text style={styles.arrowIcon}>›</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleUp} style={styles.backBtn}>
              <Text style={styles.backText}>⬆ Up</Text>
            </TouchableOpacity>
            
            <View style={styles.pathContainer}>
              <Text style={styles.pathText} numberOfLines={1} ellipsizeMode="head">
                {currentPath}
              </Text>
            </View>

            <TouchableOpacity onPress={() => setNewFolderModalVisible(true)} style={styles.newFolderBtn}>
              <Text style={styles.newFolderText}>+ Folder</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Directory Items List */}
          {loading && !refreshing ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : (
            <FlatList
              data={mode === 'selectFolder' ? items.filter(i => i.isDirectory) : items}
              keyExtractor={(item, index) => item.path || index.toString()}
              renderItem={renderItem}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No subdirectories in this folder</Text>
                </View>
              }
            />
          )}

          {/* Target Folder Confirmation Footer (Select Mode Only) */}
          {mode === 'selectFolder' && (
            <View style={styles.footerBar}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.footerLabel}>Selected Target:</Text>
                <Text style={styles.footerPath} numberOfLines={1} ellipsizeMode="middle">
                  {currentPath}
                </Text>
              </View>
              <TouchableOpacity style={styles.selectFolderBtn} onPress={handleConfirmSelectFolder}>
                <Text style={styles.selectFolderBtnText}>Select Folder</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Create Subfolder Sub-Modal */}
        <Modal visible={newFolderModalVisible} transparent animationType="fade" onRequestClose={() => setNewFolderModalVisible(false)}>
          <View style={styles.modalBgCenter}>
            <View style={styles.dialogContent}>
              <Text style={styles.dialogTitle}>📁 Create New Subfolder</Text>
              <Text style={styles.dialogSub}>Folder will be created inside: {currentPath}</Text>

              <TextInput
                style={styles.dialogInput}
                placeholder="Folder Name (e.g. Backup2026)"
                placeholderTextColor={colors.textMuted}
                value={newFolderName}
                onChangeText={setNewFolderName}
                autoFocus
              />

              <View style={styles.dialogBtnRow}>
                <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setNewFolderModalVisible(false)}>
                  <Text style={styles.dialogCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dialogConfirmBtn} onPress={handleCreateNewFolder} disabled={creatingFolder}>
                  {creatingFolder ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.dialogConfirmText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  modalBgCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
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
    padding: 12,
    backgroundColor: colors.topbar,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  backText: {
    color: colors.accent,
    fontWeight: 'bold',
    fontSize: 13,
  },
  newFolderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.accentBg,
    borderRadius: 8,
    marginRight: 6
  },
  newFolderText: {
    color: colors.accent,
    fontWeight: 'bold',
    fontSize: 13,
  },
  pathContainer: {
    flex: 1,
    paddingHorizontal: 8,
  },
  pathText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '500'
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemIcon: {
    fontSize: 22,
    marginRight: 14,
  },
  arrowIcon: {
    color: colors.textMuted,
    fontSize: 20,
    marginLeft: 8
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
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
    fontSize: 15,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600'
  },
  footerPath: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2
  },
  selectFolderBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10
  },
  selectFolderBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14
  },
  dialogContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  dialogTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 6
  },
  dialogSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 16
  },
  dialogInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 20
  },
  dialogBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  dialogCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 10
  },
  dialogCancelText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600'
  },
  dialogConfirmBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8
  },
  dialogConfirmText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold'
  }
});
