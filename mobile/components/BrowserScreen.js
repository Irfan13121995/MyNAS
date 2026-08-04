import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FileViewer from './FileViewer';
import BackupPanel from './BackupPanel';
import TunnelPanel from './TunnelPanel';
import StorageScreen from './StorageScreen';
import LibraryScreen from './LibraryScreen';
import ControlPanelScreen from './ControlPanelScreen';
import BottomNav from './BottomNav';

export default function BrowserScreen({ serverUrl, token, onLogout, onRemoteUrl }) {
  const [activeTab, setActiveTab] = useState('files'); // 'files' | 'storage' | 'library' | 'control'

  const [drives, setDrives] = useState([]);
  const [contents, setContents] = useState([]);
  const [currentPath, setCurrentPath] = useState(null); // null = Drives Dashboard
  const [history, setHistory] = useState([]); // Path history stack
  const [loading, setLoading] = useState(true);

  // File Preview Modal State
  const [selectedFile, setSelectedFile] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // File Viewer Active State
  const [activeViewFile, setActiveViewFile] = useState(null);

  // Backup Panel State
  const [backupPanelVisible, setBackupPanelVisible] = useState(false);

  // Tunnel Panel State
  const [tunnelPanelVisible, setTunnelPanelVisible] = useState(false);
  const [tunnel, setTunnel] = useState(null);

  // Load drives or folder contents based on path parameter
  const loadPath = async (path = null) => {
    setLoading(true);
    try {
      const url = path
        ? `${serverUrl}/api/files?path=${encodeURIComponent(path)}`
        : `${serverUrl}/api/files`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load content');
      }

      if (path === null) {
        setDrives(data);
        setContents([]);
      } else {
        setContents(data);
      }
    } catch (err) {
      Alert.alert('Connection Error', err.message || 'Could not communicate with NAS server.');
      if (path !== null && history.length > 0) {
        handleBack();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPath(null);
    loadTunnelStatus();
  }, []);

  const loadTunnelStatus = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/tunnel/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setTunnel(await response.json());
      }
    } catch {}
  };

  const handleDriveClick = (drivePath) => {
    const newHistory = [drivePath];
    setHistory(newHistory);
    setCurrentPath(drivePath);
    loadPath(drivePath);
  };

  const handleItemClick = (item) => {
    if (item.isDirectory) {
      const newPath = item.path;
      const newHistory = [...history, newPath];
      setHistory(newHistory);
      setCurrentPath(newPath);
      loadPath(newPath);
    } else {
      setSelectedFile(item);
      setModalVisible(true);
    }
  };

  const handleBack = () => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop();
      const prevPath = newHistory[newHistory.length - 1];
      setHistory(newHistory);
      setCurrentPath(prevPath);
      loadPath(prevPath);
    } else {
      setHistory([]);
      setCurrentPath(null);
      loadPath(null);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (item) => {
    if (item.isDirectory) return '📁';
    const ext = (item.ext || '').toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv'];
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
    const docExtensions = ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    const zipExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz'];

    if (imageExtensions.includes(ext)) return '🖼️';
    if (videoExtensions.includes(ext)) return '🎬';
    if (audioExtensions.includes(ext)) return '🎵';
    if (docExtensions.includes(ext)) return '📄';
    if (zipExtensions.includes(ext)) return '📦';
    return '📄';
  };

  const renderDriveItem = ({ item }) => {
    const totalSize = item.size || 0;
    const freeSpace = item.freeSpace || 0;
    const usedSpace = totalSize - freeSpace;
    const usedPercent = totalSize > 0 ? (usedSpace / totalSize) * 100 : 0;

    return (
      <TouchableOpacity
        style={styles.driveCard}
        onPress={() => handleDriveClick(item.path)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.driveIcon}>{item.isUsb ? '💾' : '🖥️'}</Text>
          <View style={styles.cardTitleContainer}>
            <Text style={styles.driveName}>{item.name}</Text>
            <Text style={styles.driveMeta}>
              {item.isUsb ? 'USB External Storage' : 'Local System Disk'}
            </Text>
          </View>
        </View>

        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${usedPercent}%` }]} />
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.spaceText}>
            Used: {formatBytes(usedSpace)} ({usedPercent.toFixed(0)}%)
          </Text>
          <Text style={styles.spaceText}>
            Free: {formatBytes(freeSpace)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFileItem = ({ item }) => {
    const dateStr = new Date(item.modifiedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    return (
      <TouchableOpacity
        style={styles.fileItem}
        onPress={() => handleItemClick(item)}
      >
        <Text style={styles.fileIcon}>{getFileIcon(item)}</Text>
        <View style={styles.fileDetails}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.fileMeta}>
            {item.isDirectory ? 'Folder' : formatBytes(item.size)} • {dateStr}
          </Text>
        </View>
        <Text style={styles.arrowIcon}>›</Text>
      </TouchableOpacity>
    );
  };

  if (activeViewFile) {
    return (
      <FileViewer
        file={activeViewFile}
        serverUrl={serverUrl}
        token={token}
        onClose={() => setActiveViewFile(null)}
      />
    );
  }

  if (backupPanelVisible) {
    return (
      <BackupPanel
        serverUrl={serverUrl}
        token={token}
        drives={drives}
        onClose={() => {
          setBackupPanelVisible(false);
          loadPath(null);
        }}
      />
    );
  }

  if (tunnelPanelVisible) {
    return (
      <TunnelPanel
        serverUrl={serverUrl}
        token={token}
        onClose={() => setTunnelPanelVisible(false)}
      />
    );
  }

  // Handle Module Navigation from Control Panel
  const handleControlPanelNavigate = (moduleId) => {
    if (moduleId === 'tunnel') {
      setTunnelPanelVisible(true);
    } else if (moduleId === 'files') {
      setActiveTab('files');
    } else if (moduleId === 'users' || moduleId === 'security') {
      Alert.alert('Security Info', `Server Passcode Protected.\nHost: ${serverUrl}`);
    } else {
      Alert.alert('System Module', `Module "${moduleId.toUpperCase()}" active and healthy on NAS server.`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainView}>
        {/* ── TAB CONTENT ─────────────────────────────────────────────────── */}
        {activeTab === 'storage' ? (
          <StorageScreen
            serverUrl={serverUrl}
            token={token}
            onOpenAddStorage={() => setActiveTab('files')}
          />
        ) : activeTab === 'library' ? (
          <LibraryScreen
            serverUrl={serverUrl}
            token={token}
            onSelectMedia={(item) => setActiveViewFile(item)}
          />
        ) : activeTab === 'control' ? (
          <ControlPanelScreen
            onNavigateModule={handleControlPanelNavigate}
          />
        ) : (
          /* FILES BROWSER TAB */
          <View style={{ flex: 1 }}>
            {/* Header Navigation Bar */}
            <View style={styles.header}>
              <View style={styles.headerTitleContainer}>
                {currentPath ? (
                  <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                    <Text style={styles.backButtonText}>‹ Back</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.title}>Personal NAS</Text>
                )}
                <Text style={styles.pathText} numberOfLines={1}>
                  {currentPath ? currentPath : `Connected to ${serverUrl.replace(/^https?:\/\//i, '')}`}
                </Text>
              </View>

              {!currentPath && (
                <View style={{ flexDirection: 'row' }}>
                  <TouchableOpacity
                    style={[styles.logoutButton, { borderColor: '#00C853', marginRight: 8 }]}
                    onPress={() => setTunnelPanelVisible(true)}
                  >
                    <Text style={[styles.logoutText, { color: '#00C853' }]}>🌐</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.logoutButton, { borderColor: '#4285F4', marginRight: 8 }]}
                    onPress={() => setBackupPanelVisible(true)}
                  >
                    <Text style={[styles.logoutText, { color: '#4285F4' }]}>Backup</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
                    <Text style={styles.logoutText}>Logout</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {loading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#4285F4" />
                <Text style={styles.loadingText}>Loading details...</Text>
              </View>
            ) : (
              <View style={styles.content}>
                {currentPath === null ? (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Available Drives</Text>
                    <FlatList
                      data={drives}
                      keyExtractor={(item) => item.path}
                      renderItem={renderDriveItem}
                      contentContainerStyle={styles.listContainer}
                      refreshing={loading}
                      onRefresh={() => loadPath(null)}
                      ListEmptyComponent={
                        <Text style={styles.emptyText}>No storage drives connected.</Text>
                      }
                    />
                  </View>
                ) : (
                  <View style={{ flex: 1 }}>
                    <FlatList
                      data={contents}
                      keyExtractor={(item) => item.path}
                      renderItem={renderFileItem}
                      contentContainerStyle={styles.listContainer}
                      refreshing={loading}
                      onRefresh={() => loadPath(currentPath)}
                      ListEmptyComponent={
                        <View style={styles.centerContainer}>
                          <Text style={styles.emptyText}>This folder is empty.</Text>
                        </View>
                      }
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── PERSISTENT BOTTOM NAVIGATION ───────────────────────────────────── */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tabKey) => setActiveTab(tabKey)}
      />

      {/* File Detail Modal Drawer */}
      {selectedFile && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <Text style={styles.modalIcon}>{getFileIcon(selectedFile)}</Text>
              <Text style={styles.modalFileName}>{selectedFile.name}</Text>

              <View style={styles.modalDetailsContainer}>
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Size</Text>
                  <Text style={styles.modalDetailValue}>{formatBytes(selectedFile.size)}</Text>
                </View>
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Type</Text>
                  <Text style={styles.modalDetailValue}>
                    {selectedFile.ext ? selectedFile.ext.toUpperCase().substring(1) + ' File' : 'Unknown File'}
                  </Text>
                </View>
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Modified</Text>
                  <Text style={styles.modalDetailValue}>
                    {new Date(selectedFile.modifiedAt).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Path</Text>
                  <Text style={styles.modalDetailValue} numberOfLines={2}>{selectedFile.path}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.modalActionBtn}
                onPress={() => {
                  setModalVisible(false);
                  setActiveViewFile(selectedFile);
                }}
              >
                <Text style={styles.modalActionBtnText}>Open File</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  mainView: {
    flex: 1,
    backgroundColor: '#F5F6F8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  pathText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  backButtonText: {
    color: '#1A73E8',
    fontWeight: 'bold',
    fontSize: 14,
  },
  logoutButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#6B7280',
    marginTop: 10,
    fontSize: 14,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 15,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  listContainer: {
    paddingBottom: 20,
  },
  driveCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  driveIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  cardTitleContainer: {
    flex: 1,
  },
  driveName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  driveMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#1A73E8',
    borderRadius: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spaceText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 50,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  fileIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '500',
  },
  fileMeta: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  arrowIcon: {
    color: '#9CA3AF',
    fontSize: 22,
    marginLeft: 10,
  },
  // Modal styles
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalIcon: {
    fontSize: 54,
    marginBottom: 12,
  },
  modalFileName: {
    color: '#111827',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalDetailsContainer: {
    width: '100%',
    backgroundColor: '#F5F6F8',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalDetailLabel: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '500',
  },
  modalDetailValue: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    maxWidth: '70%',
  },
  modalActionBtn: {
    width: '100%',
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  modalActionBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalCloseBtnText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  }
});
