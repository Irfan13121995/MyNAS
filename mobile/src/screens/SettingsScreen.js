/**
 * Settings Screen
 * Configure Cloudflare Tunnel Server URL, Auto-Sync Intervals, WiFi-only & Background tasks
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Switch, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getSetting, setSetting } from '../database/fileRepository';
import { registerBackgroundSyncTask, unregisterBackgroundSyncTask } from '../services/backgroundSync';
import GlassCard from '../components/GlassCard';
import GlassButton from '../components/GlassButton';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark, toggleTheme } = useTheme();
  const { serverUrl, updateServerUrl, checkConnection, isServerHealthy, logout } = useAuth();

  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [autoSync, setAutoSync] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [syncInterval, setSyncInterval] = useState('15');

  useEffect(() => {
    (async () => {
      const auto = await getSetting('auto_sync_enabled', 'true');
      const wifi = await getSetting('sync_on_wifi_only', 'false');
      const interval = await getSetting('sync_interval_minutes', '15');
      setAutoSync(auto === 'true');
      setWifiOnly(wifi === 'true');
      setSyncInterval(interval);
    })();
  }, []);

  const handleSaveUrl = async () => {
    await updateServerUrl(inputUrl);
    Alert.alert('Server Updated', 'Server URL saved and connectivity verified.');
  };

  const handleToggleAutoSync = async (val) => {
    setAutoSync(val);
    await setSetting('auto_sync_enabled', String(val));
    if (val) {
      await registerBackgroundSyncTask(parseInt(syncInterval, 10));
    } else {
      await unregisterBackgroundSyncTask();
    }
  };

  const handleToggleWifiOnly = async (val) => {
    setWifiOnly(val);
    await setSetting('sync_on_wifi_only', String(val));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Server & Tunnel Configuration */}
        <GlassCard>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>🌐 Cloudflare Tunnel & Server</Text>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Server Endpoint:</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.glassInput, borderColor: theme.glassBorder, color: theme.textPrimary }]}
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="https://mynas-hi.online"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <GlassButton title="Save Server URL" variant="primary" onPress={handleSaveUrl} style={{ flex: 1 }} />
            <GlassButton title="Test Connection" variant="secondary" onPress={checkConnection} style={{ flex: 1 }} />
          </View>
        </GlassCard>

        {/* Sync Settings */}
        <GlassCard style={{ marginTop: 12 }}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>⚡ Background Auto-Sync</Text>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>Enable Auto-Sync</Text>
              <Text style={{ fontSize: 11, color: theme.textSecondary }}>Periodically back up new photos in background</Text>
            </View>
            <Switch value={autoSync} onValueChange={handleToggleAutoSync} trackColor={{ true: theme.accent }} />
          </View>

          <View style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: theme.glassBorder, marginTop: 10, paddingTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>WiFi-Only Backup</Text>
              <Text style={{ fontSize: 11, color: theme.textSecondary }}>Prevent mobile data usage during sync</Text>
            </View>
            <Switch value={wifiOnly} onValueChange={handleToggleWifiOnly} trackColor={{ true: theme.accent }} />
          </View>
        </GlassCard>

        {/* Appearance */}
        <GlassCard style={{ marginTop: 12 }}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>🎨 Appearance</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>Dark Mode</Text>
              <Text style={{ fontSize: 11, color: theme.textSecondary }}>Toggle between Dark Acrylic and Light Glass</Text>
            </View>
            <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: theme.accent }} />
          </View>
        </GlassCard>

        {/* Logout */}
        <GlassCard style={{ marginTop: 12 }}>
          <GlassButton title="Disconnect & Sign Out" variant="danger" onPress={logout} />
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 22, fontWeight: '900' },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  }
});
