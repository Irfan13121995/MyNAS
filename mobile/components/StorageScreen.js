import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, StatusBar
} from 'react-native';

export default function StorageScreen({ serverUrl, token, onOpenAddStorage }) {
  const [activeTab, setActiveTab] = useState('storage'); // 'storage' | 'external'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drives, setDrives] = useState([]);

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00BCD4" />}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#00BCD4" />
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
                  <View style={styles.volumeHeader}>
                    <View style={styles.volumeTitleRow}>
                      <Text style={styles.volumeIcon}>📂</Text>
                      <Text style={styles.volumeTitle}>Storage Volume</Text>
                    </View>
                    <Text style={styles.pctText}>{pct}% Used</Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: pct > 85 ? '#EF4444' : '#00BCD4' }]} />
                  </View>

                  <View style={styles.capacityRow}>
                    <Text style={styles.capacityText}>
                      Free: {formatBytes(drive.freeSpace)}
                    </Text>
                    <Text style={styles.capacityText}>
                      Used: {formatBytes(usedSpace)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* FAB button to configure storage */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={onOpenAddStorage}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  topbarTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  topbarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconText: {
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(0, 188, 212, 0.18)',
    borderColor: '#00BCD4',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#22D3EE',
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
    color: '#94A3B8',
    fontSize: 14,
  },
  driveCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 3,
    shadowColor: '#000',
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
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    color: '#F8FAFC',
    letterSpacing: -0.2,
  },
  poolDesc: {
    fontSize: 13,
    color: '#64748B',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    backgroundColor: 'rgba(0, 188, 212, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#22D3EE',
  },
  specTag: {
    fontSize: 12,
    color: '#94A3B8',
  },
  specTagDivider: {
    fontSize: 12,
    color: '#64748B',
  },
  volumeCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
    color: '#F8FAFC',
  },
  pctText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#22D3EE',
  },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  capacityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  capacityText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
  },
  emptyCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 3,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 13,
    color: '#94A3B8',
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
    backgroundColor: '#00BCD4',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#00BCD4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  fabIcon: {
    fontSize: 30,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: -2,
  },
});
