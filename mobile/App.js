/**
 * Personal NAS Mobile Application (v2)
 * Offline-First SQLite Architecture with Background Auto-Sync
 */
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { SyncProvider } from './src/contexts/SyncContext';
import { initDatabase } from './src/database/index';
import { registerBackgroundSyncTask } from './src/services/backgroundSync';

import DashboardScreen from './src/screens/DashboardScreen';
import QueueScreen from './src/screens/QueueScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ConnectionScreen from './src/screens/ConnectionScreen';
import GlassTabBar from './src/components/GlassTabBar';

function MainApp() {
  const { theme, isDark } = useTheme();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {!isAuthenticated ? (
        <ConnectionScreen />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {activeTab === 'dashboard' && <DashboardScreen />}
            {activeTab === 'queue' && <QueueScreen />}
            {activeTab === 'settings' && <SettingsScreen />}
          </View>
          <GlassTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        </>
      )}
    </View>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // 1. Initialize SQLite Database & Schema
        await initDatabase();

        // 2. Register Background Sync Task
        await registerBackgroundSyncTask(15);

      } catch (err) {
        console.error('[App] Startup error:', err);
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B0F19', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <SyncProvider>
            <MainApp />
          </SyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
