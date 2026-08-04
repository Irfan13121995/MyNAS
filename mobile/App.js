import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, StatusBar, Text, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import ConnectionScreen from './components/ConnectionScreen';
import HomeScreen from './components/HomeScreen';
import StorageScreen from './components/StorageScreen';
import LibraryScreen from './components/LibraryScreen';
import ControlPanelScreen from './components/ControlPanelScreen';
import BottomNav from './components/BottomNav';
import AutoSyncModal from './components/AutoSyncModal';
import FileViewerModal from './components/FileViewerModal';
import { authenticateBiometric } from './services/biometricService';
import { getSecureItem, setSecureItem, deleteSecureItem } from './services/secureStoreService';
import * as TaskManager from 'expo-task-manager';
import { runFullSync } from './services/syncService';

const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
const BACKGROUND_SYNC_TASK = 'background-nas-sync';

if (!isExpoGo) {
  try {
    TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
      try {
        const serverUrl = await getSecureItem('nas_server_url');
        const token = await getSecureItem('nas_jwt_token');
        const syncFolder = await AsyncStorage.getItem('autosync_folder');
        const mediaType = await AsyncStorage.getItem('autosync_type') || 'all';
        
        if (!serverUrl || !token || !syncFolder) {
          return 1; // NoData
        }
        
        const result = await runFullSync(serverUrl, token, syncFolder, mediaType, null, null);
        return result.synced > 0 ? 2 : 1; // NewData : NoData
      } catch (err) {
        return 0; // Failed
      }
    });
  } catch (e) {}
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0F17'}}>
          <Text style={{color: '#fff', fontSize: 18, marginBottom: 20}}>Something went wrong.</Text>
          <Text style={{color: '#00BCD4', fontSize: 16}} onPress={() => this.setState({hasError: false})}>Restart App</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [serverUrl, setServerUrl] = useState(null);
  const [token, setToken] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'storage' | 'library' | 'control'
  const [libraryFilter, setLibraryFilter] = useState('all'); // 'all' | 'photos' | 'videos'
  const [drives, setDrives] = useState([]);

  // Modals
  const [autoSyncVisible, setAutoSyncVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [activeMediaList, setActiveMediaList] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    bootstrapAsync(controller.signal);
    registerBackgroundSync();
    return () => {
      controller.abort();
    };
  }, []);

  const registerBackgroundSync = async () => {
    try {
      const isEnabled = await AsyncStorage.getItem('autosync_enabled');
      if (isEnabled === 'true') {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
          minimumInterval: 60 * 15, // 15 minutes
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
    } catch (e) {
      console.warn('Failed to register background sync task', e);
    }
  };

  const bootstrapAsync = async (signal) => {
    try {
      const storedUrl = await getSecureItem('nas_server_url');
      const storedToken = await getSecureItem('nas_jwt_token');

      if (storedUrl && storedToken) {
        const ok = await verifyToken(storedUrl, storedToken, signal);
        if (ok) {
          // Biometric prompt on launch if enrolled
          const bioRes = await authenticateBiometric('Unlock Personal NAS');
          if (bioRes && bioRes.success) {
            setServerUrl(storedUrl);
            setToken(storedToken);
            fetchDrives(storedUrl, storedToken, signal);
          } else {
            handleLogout();
          }
        } else {
          handleLogout();
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('Bootstrapping error:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyToken = async (url, jwtToken, signal) => {
    try {
      const res = await fetch(`${url}/api/auth/verify`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
        signal: signal || AbortSignal.timeout(8000)
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  };

  const fetchDrives = async (url, jwtToken, signal) => {
    try {
      const res = await fetch(`${url}/api/drives`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
        signal: signal || AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const data = await res.json();
        setDrives(data || []);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('Failed to load drives:', e);
      }
    }
  };

  const handleConnect = async (url, jwtToken) => {
    try {
      await setSecureItem('nas_server_url', url);
      await setSecureItem('nas_jwt_token', jwtToken);
      setServerUrl(url);
      setToken(jwtToken);
      fetchDrives(url, jwtToken);
    } catch (e) {
      console.error('Failed to save auth credentials', e);
    }
  };

  const handleLogout = async () => {
    try {
      await deleteSecureItem('nas_server_url');
      await deleteSecureItem('nas_jwt_token');
      setServerUrl(null);
      setToken(null);
      setDrives([]);
    } catch (e) {
      console.error('Failed to clear credentials', e);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F17" translucent={false} />
        <ActivityIndicator size="large" color="#00BCD4" />
        <Text style={styles.loadingText}>Connecting to Personal NAS...</Text>
      </View>
    );
  }

  if (!serverUrl || !token) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F17" translucent={false} />
        <ConnectionScreen onConnect={handleConnect} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <View style={styles.rootWrapper}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F17" translucent={false} />
      <SafeAreaView style={styles.container}>

        {/* Main Screen Body */}
        <View style={styles.mainContent}>
          {activeTab === 'home' && (
            <HomeScreen
              serverUrl={serverUrl}
              token={token}
              onSelectFile={(f, list) => {
                setSelectedFile(f);
                if (list) setActiveMediaList(list);
              }}
              onOpenFileBrowser={() => setActiveTab('storage')}
              onOpenLibrary={(category) => {
                const filter = category === 'video' ? 'videos' : category === 'photos' ? 'photos' : 'all';
                setLibraryFilter(filter);
                setActiveTab('library');
              }}
            />
          )}

          {activeTab === 'storage' && (
            <StorageScreen
              serverUrl={serverUrl}
              token={token}
              onOpenAddStorage={() => setAutoSyncVisible(true)}
            />
          )}

          {activeTab === 'library' && (
            <LibraryScreen
              serverUrl={serverUrl}
              token={token}
              initialFilter={libraryFilter}
              onSelectMedia={(m, list) => {
                setSelectedFile(m);
                if (list) setActiveMediaList(list);
              }}
            />
          )}

          {activeTab === 'control' && (
            <ControlPanelScreen
              serverUrl={serverUrl}
              token={token}
              onLogout={handleLogout}
              onNavigateModule={(modId) => {
                if (modId === 'files') setActiveTab('storage');
                if (modId === 'autosync') setAutoSyncVisible(true);
              }}
              onOpenAutoSync={() => setAutoSyncVisible(true)}
            />
          )}
        </View>

        {/* Floating Apple Liquid Glass Bottom Navigation */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tabKey) => {
            if (tabKey === 'library') setLibraryFilter('all');
            setActiveTab(tabKey);
          }}
        />

        {/* Gallery Auto-Sync Configuration Modal */}
        <AutoSyncModal
          visible={autoSyncVisible}
          serverUrl={serverUrl}
          token={token}
          drives={drives}
          onClose={() => setAutoSyncVisible(false)}
        />
      </SafeAreaView>

      {/* File Viewer Modal — OUTSIDE SafeAreaView to render ABOVE everything including BottomNav */}
      {selectedFile && (
        <FileViewerModal
          file={selectedFile}
          mediaList={activeMediaList}
          serverUrl={serverUrl}
          token={token}
          onClose={() => {
            setSelectedFile(null);
            setActiveMediaList([]);
          }}
        />
      )}
    </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  rootWrapper: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0B0F17',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
  },
});
