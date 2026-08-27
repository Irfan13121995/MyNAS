/**
 * Visual Sync Progress Card with Progress Bar & Status Pill
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useSync } from '../contexts/SyncContext';
import GlassCard from './GlassCard';
import GlassButton from './GlassButton';

export default function SyncProgressCard() {
  const { theme } = useTheme();
  const { isSyncing, currentFile, progress, syncStats, startScanAndSync, cancelSync } = useSync();

  const percent = syncStats.total > 0 
    ? Math.round((syncStats.completed / syncStats.total) * 100)
    : 0;

  return (
    <GlassCard active={isSyncing}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Auto Backup Status</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {isSyncing ? 'Syncing to your Personal NAS' : syncStats.pending > 0 ? `${syncStats.pending} pending files` : 'All files up to date'}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: isSyncing ? theme.successBg : theme.glassInput }]}>
          <View style={[styles.statusDot, { backgroundColor: isSyncing ? theme.success : theme.textMuted }]} />
          <Text style={[styles.statusText, { color: isSyncing ? theme.success : theme.textSecondary }]}>
            {isSyncing ? 'SYNCING' : 'IDLE'}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.glassInput }]}>
        <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: theme.accent }]} />
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <Text style={[styles.statsText, { color: theme.textMuted }]}>
          Completed: <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>{syncStats.completed}</Text> / {syncStats.total}
        </Text>
        <Text style={[styles.statsPercent, { color: theme.accent }]}>{percent}%</Text>
      </View>

      {/* Active File Syncing Indicator */}
      {isSyncing && currentFile && (
        <View style={[styles.currentFileBox, { backgroundColor: theme.glassInput }]}>
          <Text style={{ fontSize: 16 }}>📤</Text>
          <Text style={[styles.currentFileName, { color: theme.textPrimary }]} numberOfLines={1}>
            {currentFile.filename}
          </Text>
          <Text style={[styles.currentFileProgress, { color: theme.accent }]}>{progress}%</Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {isSyncing ? (
          <GlassButton
            title="Cancel Backup"
            variant="danger"
            onPress={cancelSync}
            style={{ flex: 1 }}
          />
        ) : (
          <GlassButton
            title={syncStats.pending > 0 ? "Sync Now" : "Scan & Backup"}
            variant="primary"
            onPress={startScanAndSync}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsText: {
    fontSize: 12,
  },
  statsPercent: {
    fontSize: 13,
    fontWeight: '800',
  },
  currentFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  currentFileName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  currentFileProgress: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  }
});
