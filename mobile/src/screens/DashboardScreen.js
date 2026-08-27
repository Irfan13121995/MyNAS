/**
 * Main Glassmorphism Dashboard Screen
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import SyncProgressCard from '../components/SyncProgressCard';
import RecentBackupsList from '../components/RecentBackupsList';
import GlassCard from '../components/GlassCard';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme, isDark, toggleTheme } = useTheme();
  const { serverUrl, isServerHealthy } = useAuth();
  const { syncStats } = useSync();

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Header Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.brandTitle, { color: theme.accent }]}>Personal NAS</Text>
          <View style={styles.serverStatusRow}>
            <View style={[styles.statusDot, { backgroundColor: isServerHealthy ? theme.success : theme.danger }]} />
            <Text style={[styles.serverUrlText, { color: theme.textSecondary }]} numberOfLines={1}>
              {serverUrl.replace(/^https?:\/\//, '')}
            </Text>
          </View>
        </View>

        {/* Theme Switcher Button */}
        <TouchableOpacity
          onPress={toggleTheme}
          style={[styles.themeBtn, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 18 }}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Sync Progress Indicator */}
        <SyncProgressCard />

        {/* Quick Stats Grid */}
        <View style={styles.statsGrid}>
          <GlassCard style={styles.statCard}>
            <Text style={{ fontSize: 24, marginBottom: 4 }}>📸</Text>
            <Text style={[styles.statValue, { color: theme.textPrimary }]}>{syncStats.completed}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Backed Up</Text>
          </GlassCard>

          <GlassCard style={styles.statCard}>
            <Text style={{ fontSize: 24, marginBottom: 4 }}>⏳</Text>
            <Text style={[styles.statValue, { color: theme.warning }]}>{syncStats.pending}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>In Queue</Text>
          </GlassCard>

          <GlassCard style={styles.statCard}>
            <Text style={{ fontSize: 24, marginBottom: 4 }}>💾</Text>
            <Text style={[styles.statValue, { color: theme.accent }]}>{formatBytes(syncStats.syncedBytes)}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Storage</Text>
          </GlassCard>
        </View>

        {/* Recent Backups List */}
        <RecentBackupsList />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  serverStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  serverUrlText: {
    fontSize: 11,
    fontWeight: '500',
  },
  themeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 6,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    marginVertical: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
  }
});
