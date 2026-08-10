import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, StatusBar
} from 'react-native';
import CircularGauge from './CircularGauge';
import FileExplorerModal from './FileExplorerModal';
import { useTheme } from '../contexts/ThemeContext';
import { useMemo } from 'react';

export default function StorageScreen({ serverUrl, token, onOpenAddStorage }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState('storage'); // 'storage' | 'external'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drives, setDrives] = useState([]);
  const [exploreVisible, setExploreVisible] = useState(false);
  const [explorePath, setExplorePath] = useState('');

  const fetchDrives = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/drives`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDrives(data || []);
      }
    } catch (err) {
      console.warn('Failed to fetch storage drives:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDrives();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDrives();
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const internalDrives = drives.filter(d => !d.isUsb);
  const externalDrives = drives.filter(d => d.isUsb);

  const displayDrives = activeTab === 'storage' ? internalDrives : externalDrives;

  const statusBarPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16;

  return (
    <View style={styles.container}>
      {/* ── DARK GLASS TOPBAR (SAFE FROM STATUS BAR) ─────────────────── */}
      <View style={[styles.topbar, { paddingTop: statusBarPadding }]}>
        <Text style={styles.topbarTitle}>Storage</Text>
        <View style={styles.topbarActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={onRefresh}>
            <Text style={styles.iconText}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onOpenAddStorage}>
            <Text style={styles.iconText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── TAB BAR SWITCHER ──────────────────────────────────────────────── */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'storage' && styles.tabBtnActive]}
          onPress={() => setActiveTab('storage')}
        >
          <Text style={[styles.tabText, activeTab === 'storage' && styles.tabTextActive]}>
            Internal Disks ({internalDrives.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'external' && styles.tabBtnActive]}
          onPress={() => setActiveTab('external')}
        >
          <Text style={[styles.tabText, activeTab === 'external' && styles.tabTextActive]}>
            External & USB ({externalDrives.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── DRIVES LIST / DETAILS ────────────────────────────────────────── */}
      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Scanning storage pools...</Text>
          </View>
        ) : displayDrives.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>{activeTab === 'storage' ? '💾' : '🔌'}</Text>
            <Text style={styles.emptyTitle}>
              No {activeTab === 'storage' ? 'Internal Disks' : 'External USB Storage'} Detected
            </Text>
            <Text style={styles.emptySub}>
              {activeTab === 'storage'
                ? 'Register your local drives on the Personal NAS server to assign them.'
                : 'Plug in a USB drive to your NAS host device to view external volumes.'}
            </Text>
          </View>
        ) : (
          displayDrives.map((drive, idx) => {
            const usedSpace = (drive.size || 0) - (drive.freeSpace || 0);
            const pct = drive.size ? Math.min(100, Math.round((usedSpace / drive.size) * 100)) : 0;
            const driveLabel = drive.name || drive.label || `Drive ${drive.letter}`;

            return (
              <View key={drive.letter || idx} style={styles.driveCard}>
                <View style={styles.driveHeader}>
                  <View style={styles.poolIconBox}>
                    <Text style={styles.poolIcon}>{drive.isUsb ? '🔌' : '💾'}</Text>
                  </View>

                  <View style={styles.poolInfo}>
                    <View style={styles.poolTitleRow}>
                      <Text style={styles.poolTitle}>{driveLabel}</Text>
                      <Text style={styles.poolDesc}>({drive.letter})</Text>
                    </View>

                    <View style={styles.tagRow}>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>ONLINE</Text>
                      </View>
                      <Text style={styles.specTagDivider}>•</Text>
                      <Text style={styles.specTag}>{formatBytes(drive.size)} Total</Text>
                    </View>
                  </View>
                </View>

                {/* Progress Bar & Storage Utilization */}
                <View style={styles.volumeCard}>
                  <View style={{ flex: 1, marginRight: 16 }}>
                    <View style={styles.volumeHeader}>
                      <View style={styles.volumeTitleRow}>
                        <Text style={styles.volumeIcon}>📂</Text>
                        <Text style={styles.volumeTitle}>Storage Volume</Text>
                      </View>
                    </View>
                    <View style={styles.capacityRow}>
                      <Text style={styles.capacityText}>Free: {formatBytes(drive.freeSpace)}</Text>
                    </View>
                    <View style={styles.capacityRow}>
                      <Text style={styles.capacityText}>Used: {formatBytes(usedSpace)}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.exploreBtn} 
                      onPress={() => {
                        const raw = drive.path || drive.letter || 'C:\\';
                        let clean = raw.replace(/::+/g, ':').trim();
                        if (/^[a-zA-Z]:?$/.test(clean)) {
                          clean = clean.replace(':', '') + ':\\';
                        }
                        setExplorePath(clean);
                        setExploreVisible(true);
                      }}
                    >
                      <Text style={styles.exploreBtnText}>📂 Explore Disk</Text>
                    </TouchableOpacity>
                  </View>
                  <CircularGauge percentage={pct} size={68} strokeWidth={7} />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <FileExplorerModal
        visible={exploreVisible}
        initialPath={explorePath}
        serverUrl={serverUrl}
        token={token}
        onClose={() => setExploreVisible(false)}
      />

      {/* FAB button to configure storage */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={onOpenAddStorage}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: colors.topbar,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    elevation: 4,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  topbarTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  topbarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    padding: 10,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  iconText: {
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.topbar,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnActive: {
    backgroundColor: colors.accentBg,
    borderColor: colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.accentLight,
    fontWeight: '800',
  },
  scrollBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 14,
  },
  driveCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  driveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  poolIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  poolIcon: {
    fontSize: 24,
  },
  poolInfo: {
    flex: 1,
  },
  poolTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 4,
  },
  poolTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  poolDesc: {
    fontSize: 13,
    color: colors.textMuted,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    backgroundColor: colors.accentBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.accentLight,
  },
  specTag: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  specTagDivider: {
    fontSize: 12,
    color: colors.textMuted,
  },
  volumeCard: {
    backgroundColor: colors.surfaceSolid,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  volumeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  volumeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  volumeIcon: {
    fontSize: 18,
  },
  volumeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pctText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accentLight,
  },
  exploreBtn: {
    marginTop: 10,
    backgroundColor: colors.accentBg,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  exploreBtnText: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: 'bold',
  },
  capacityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  capacityText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    zIndex: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  fabIcon: {
    fontSize: 30,
    color: colors.background,
    fontWeight: '700',
    marginTop: -2,
  },
});
