import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, StatusBar, Text, Platform, BackHandler, Modal, TextInput, TouchableOpacity, Alert, Image } from 'react-native';
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
import BackupPanel from './components/BackupPanel';
import FileViewerModal from './components/FileViewerModal';
import { authenticateBiometric } from './services/biometricService';
import { getSecureItem, setSecureItem, deleteSecureItem } from './services/secureStoreService';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { runFullSync } from './services/syncService';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
const BACKGROUND_SYNC_TASK = 'background-nas-sync';

if (!isExpoGo) {
  try {
    TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
      try {
        const serverUrl = await getSecureItem('nas_server_url');
        const token = await getSecureItem('nas_jwt_token');
        const targetDrive = await AsyncStorage.getItem('autosync_drive');
        const syncFolder = await AsyncStorage.getItem('autosync_folder');
        const mediaType = await AsyncStorage.getItem('autosync_type') || 'both';
        
        if (!serverUrl || !token || !syncFolder) {
          return 1; // BackgroundFetch.Result.NoData
        }

        const fullTargetPath = targetDrive 
          ? `${targetDrive.replace(/[\/\\]+$/, '')}\\${syncFolder.replace(/^[\/\\]+/, '')}`
          : syncFolder;
        
        const result = await runFullSync(serverUrl, token, fullTargetPath, mediaType, null, null);
        return result.synced > 0 ? 2 : 1; // BackgroundFetch.Result.NewData : NoData
      } catch (err) {
        console.warn('Background sync task error:', err);
        return 0; // BackgroundFetch.Result.Failed
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

function AppContent() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [serverUrl, setServerUrl] = useState(null);
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState('NAS User');
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'storage' | 'library' | 'control'
  const [libraryFilter, setLibraryFilter] = useState('all'); // 'all' | 'photos' | 'videos'
  const [drives, setDrives] = useState([]);

  // Biometric PIN Fallback State
  const [pinFallbackVisible, setPinFallbackVisible] = useState(false);
  const [fallbackPin, setFallbackPin] = useState('');
  const [pendingUrl, setPendingUrl] = useState('');
  const [pendingToken, setPendingToken] = useState('');

  // Modals
  const [autoSyncVisible, setAutoSyncVisible] = useState(false);
  const [backupPanelVisible, setBackupPanelVisible] = useState(false);
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

  // Global Hardware BackHandler Listener
  useEffect(() => {
    const onBackPress = () => {
      if (selectedFile) {
        setSelectedFile(null);
        setActiveMediaList([]);
        return true;
      }
      if (backupPanelVisible) {
        setBackupPanelVisible(false);
        return true;
      }
      if (autoSyncVisible) {
        setAutoSyncVisible(false);
        return true;
      }
      if (activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }
      return false; // Exit app
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [selectedFile, autoSyncVisible, activeTab]);

  const registerBackgroundSync = async () => {
    if (isExpoGo || !BackgroundFetch || !BackgroundFetch.registerTaskAsync) return;
    try {
      const isEnabled = await AsyncStorage.getItem('autosync_enabled');
      if (isEnabled === 'true') {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
        if (!isRegistered) {
          await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
            minimumInterval: 60 * 15, // 15 minutes
            stopOnTerminate: false,
            startOnBoot: true,
          });
        }
      }
    } catch (e) {
      console.warn('Failed to register background sync task', e);
    }
  };

  const bootstrapAsync = async (signal) => {
    try {
      const storedUrl = await getSecureItem('nas_server_url');
      const storedToken = await getSecureItem('nas_jwt_token');
      const storedUser = await AsyncStorage.getItem('nas_username');
      if (storedUser) setUsername(storedUser);

      if (storedUrl && storedToken) {
        const verifyResult = await verifyToken(storedUrl, storedToken, signal);
        if (verifyResult.valid || verifyResult.networkError) {
          // Biometric prompt on launch if enrolled
          const bioRes = await authenticateBiometric('Unlock Personal NAS');
          if (bioRes && bioRes.success) {
            setServerUrl(storedUrl);
            setToken(storedToken);
            fetchDrives(storedUrl, storedToken, signal);
          } else {
            // Show passcode PIN fallback modal instead of logging out
            setPendingUrl(storedUrl);
            setPendingToken(storedToken);
            setPinFallbackVisible(true);
          }
        } else {
          // Explicitly 401 / 403 unauthorized token -> log out
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
      if (res.ok) {
        const data = await res.json();
        if (data.username) {
          setUsername(data.username);
          await AsyncStorage.setItem('nas_username', data.username);
        }
        return { valid: true, networkError: false };
      }
      if (res.status === 401 || res.status === 403) {
        return { valid: false, networkError: false };
      }
      return { valid: false, networkError: true };
    } catch (e) {
      return { valid: false, networkError: true };
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

  const handleConnect = async (url, jwtToken, userDisplayName) => {
    try {
      await setSecureItem('nas_server_url', url);
      await setSecureItem('nas_jwt_token', jwtToken);

      let nameToSet = userDisplayName;
      if (!nameToSet) {
        try {
          const res = await fetch(`${url}/api/auth/verify`, {
            headers: { Authorization: `Bearer ${jwtToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.username) nameToSet = data.username;
          }
        } catch (e) {}
      }

      nameToSet = nameToSet || 'NAS User';
      await AsyncStorage.setItem('nas_username', nameToSet);
      setServerUrl(url);
      setToken(jwtToken);
      setUsername(nameToSet);
      fetchDrives(url, jwtToken);
    } catch (e) {
      console.error('Failed to save auth credentials', e);
    }
  };

  const handleLogout = async () => {
    try {
      await deleteSecureItem('nas_server_url');
      await deleteSecureItem('nas_jwt_token');
      await AsyncStorage.removeItem('nas_username');
      setServerUrl(null);
      setToken(null);
      setUsername('NAS User');
      setDrives([]);
    } catch (e) {
      console.error('Failed to clear credentials', e);
    }
  };

  const handlePinSubmit = async () => {
    if (!fallbackPin) {
      Alert.alert('Error', 'Please enter your passcode PIN');
      return;
    }

    try {
      const res = await fetch(`${pendingUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: fallbackPin })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const validToken = data.token || pendingToken;
        setServerUrl(pendingUrl);
        setToken(validToken);
        fetchDrives(pendingUrl, validToken);
        setPinFallbackVisible(false);
        setFallbackPin('');
      } else {
        Alert.alert('Invalid PIN', 'Passcode PIN is incorrect. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not verify passcode.');
    }
  };

  if (pinFallbackVisible) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} translucent={false} />
        <Modal visible={true} transparent={true} animationType="slide">
          <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ width: '100%', maxWidth: 340, backgroundColor: colors.surfaceSolid, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderLight }}>
              <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 8 }}>🔒</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 6 }}>Enter Passcode PIN</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>Biometric verification failed. Enter your NAS Passcode PIN to unlock.</Text>
              
              <TextInput
                style={{ backgroundColor: colors.inputBg, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, textAlign: 'center', letterSpacing: 4, borderWidth: 1, borderColor: colors.accent, marginBottom: 20 }}
                placeholder="••••••"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                secureTextEntry
                value={fallbackPin}
                onChangeText={setFallbackPin}
                maxLength={6}
              />

              <TouchableOpacity
                style={{ backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 12 }}
                onPress={handlePinSubmit}
              >
                <Text style={{ color: '#0F172A', fontSize: 15, fontWeight: '700' }}>Unlock NAS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ paddingVertical: 10, alignItems: 'center' }}
                onPress={handleLogout}
              >
                <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Log Out & Switch Server</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} translucent={false} />
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Connecting to Personal NAS...</Text>
      </View>
    );
  }

  if (!serverUrl || !token) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} translucent={false} />
        <ConnectionScreen onConnect={handleConnect} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <View style={[styles.rootWrapper, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} translucent={false} />
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>

        {/* ── TOP BAR HEADER (Logo on Left, Username on Right) ──────────── */}
        <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.borderLight }]}>
          <View style={styles.topBarLeft}>
            <Image source={require('./assets/icon.png')} style={styles.topBarLogo} />
            <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>myNAS</Text>
          </View>
          <View style={styles.topBarRight}>
            <View style={[styles.userBadge, { backgroundColor: colors.accentBg, borderColor: colors.borderLight }]}>
              <Text style={styles.userBadgeIcon}>👤</Text>
              <Text style={[styles.userBadgeText, { color: colors.accent }]} numberOfLines={1}>
                {username || 'NAS User'}
              </Text>
            </View>
          </View>
        </View>

        {/* Main Screen Body */}
        <View style={[styles.mainContent, { backgroundColor: colors.background }]}>
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
              drives={drives}
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
                if (modId === 'autosync') setBackupPanelVisible(true);
              }}
              onOpenAutoSync={() => setBackupPanelVisible(true)}
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

        {/* Google Photos-Style Auto-Backup Center Modal */}
        <Modal
          visible={backupPanelVisible}
          animationType="slide"
          onRequestClose={() => setBackupPanelVisible(false)}
        >
          <BackupPanel
            serverUrl={serverUrl}
            token={token}
            drives={drives}
            onClose={() => setBackupPanelVisible(false)}
          />
        </Modal>

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

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  rootWrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: 170,
  },
  userBadgeIcon: {
    fontSize: 12,
  },
  userBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mainContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
});
