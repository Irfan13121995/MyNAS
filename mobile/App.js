import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, StatusBar, Text, SafeAreaView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
    bootstrapAsync();
  }, []);

  const bootstrapAsync = async () => {
    try {
      const storedUrl = await getSecureItem('nas_server_url');
      const storedToken = await getSecureItem('nas_jwt_token');

      if (storedUrl && storedToken) {
        const ok = await verifyToken(storedUrl, storedToken);
        if (ok) {
          // Biometric prompt on launch if enrolled
          const bioRes = await authenticateBiometric('Unlock Personal NAS');
          if (bioRes && bioRes.success) {
            setServerUrl(storedUrl);
            setToken(storedToken);
            fetchDrives(storedUrl, storedToken);
          } else {
            handleLogout();
          }
        } else {
          handleLogout();
        }
      }
    } catch (e) {
      console.warn('Bootstrapping error:', e);
    } finally {
      setLoading(false);
    }
  };

  const verifyToken = async (url, jwtToken) => {
    try {
      const res = await fetch(`${url}/api/auth/verify`, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  };

  const fetchDrives = async (url, jwtToken) => {
    try {
      const res = await fetch(`${url}/api/drives`, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDrives(data || []);
      }
    } catch (e) {
      console.warn('Failed to load drives:', e);
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
