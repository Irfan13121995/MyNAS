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
  SafeAreaView,
} from 'react-native';
import FileViewer from './FileViewer';
import BackupPanel from './BackupPanel';

export default function BrowserScreen({ serverUrl, token, onLogout, onRemoteUrl }) {
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

  const [tunnel, setTunnel] = useState(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);

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
      // Fallback: If opening subfolder fails, pop history
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
    } catch {
      // Drive browsing remains available even when remote access is unavailable.
    }
  };

  const handleTunnelToggle = async () => {
    const shouldStop = tunnel?.status === 'running';
    setTunnelLoading(true);

    try {
      const response = await fetch(`${serverUrl}/api/tunnel/${shouldStop ? 'stop' : 'start'}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to update remote access');
      }

      if (shouldStop) {
        setTunnel({ status: 'stopped', url: null, error: null });
        await onRemoteUrl?.(null);
        Alert.alert('Remote Access Stopped', 'The temporary tunnel is no longer available.');
      } else {
        setTunnel({ status: 'running', url: data.url, error: null });
        await onRemoteUrl?.(data.url);
        Alert.alert('Remote Access Ready', `Use this URL when away from home:\n${data.url}`);
      }
    } catch (err) {
      Alert.alert('Remote Access Error', err.message || 'Could not update remote access.');
      await loadTunnelStatus();
    } finally {
      setTunnelLoading(false);
    }
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
      newHistory.pop(); // Remove current path
      const prevPath = newHistory[newHistory.length - 1];
      setHistory(newHistory);
      setCurrentPath(prevPath);
      loadPath(prevPath);
    } else {
      // Return to Drives dashboard
      setHistory([]);
      setCurrentPath(null);
      loadPath(null);
    }
  };

  // Helper to format bytes to dynamic readables
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Icon selector based on file extensions
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
    
    return '📄'; // Default File Icon
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
          loadPath(null); // Reload drives to refresh storage size
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Header Navigation Bar */}
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
              style={[styles.logoutButton, { borderColor: '#4285F4', marginRight: 10 }]}
              onPress={() => setBackupPanelVisible(true)}
            >
              <Text style={[styles.logoutText, { color: '#4285F4' }]}>Backup</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logoutButton, { borderColor: tunnel?.status === 'running' ? '#00C853' : '#FFB300', marginRight: 10 }]}
              onPress={handleTunnelToggle}
              disabled={tunnelLoading}
            >
              <Text style={[styles.logoutText, { color: tunnel?.status === 'running' ? '#00C853' : '#FFB300' }]}>
                {tunnelLoading ? 'Please wait' : tunnel?.status === 'running' ? 'Remote On' : 'Remote'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 2. Loading State */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Loading details...</Text>
        </View>
      ) : (
        /* 3. Render Dashboard vs Folder Browser */
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

      {/* 4. File Preview Modal Drawer */}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: '#222',
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  pathText: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e1e1e',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  backButtonText: {
    color: '#4285F4',
    fontWeight: 'bold',
    fontSize: 14,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e53935',
  },
  logoutText: {
    color: '#e53935',
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
    color: '#aaa',
    marginTop: 10,
    fontSize: 14,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 15,
  },
  listContainer: {
    paddingBottom: 20,
  },
  driveCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#2d2d2d',
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  driveMeta: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 2,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#2d2d2d',
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4285F4',
    borderRadius: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spaceText: {
    color: '#aaa',
    fontSize: 12,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 50,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#1e1e1e',
  },
  fileIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  fileMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  arrowIcon: {
    color: '#444',
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
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 30,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#2d2d2d',
  },
  modalIcon: {
    fontSize: 64,
    marginBottom: 15,
  },
  modalFileName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalDetailsContainer: {
    width: '100%',
    backgroundColor: '#121212',
    borderRadius: 10,
    padding: 15,
    marginBottom: 25,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#1e1e1e',
  },
  modalDetailLabel: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  modalDetailValue: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'right',
    maxWidth: '70%',
  },
  modalActionBtn: {
    width: '100%',
    backgroundColor: '#4285F4',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalActionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  modalCloseBtnText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
