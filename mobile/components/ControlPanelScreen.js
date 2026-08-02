import React, { useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert, Platform, StatusBar
} from 'react-native';

export default function ControlPanelScreen({ serverUrl, token, onNavigateModule, onOpenAutoSync, onLogout }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState(null); // 'hardware' | 'network' | 'security' | 'tunnel' | 'users' | 'about'
  const [modalLoading, setModalLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [systemData, setSystemData] = useState(null);
  const [tunnelData, setTunnelData] = useState(null);

  const sections = [
    {
      title: 'Connection & Access',
      modules: [
        { id: 'autosync', label: 'Gallery Auto-Sync', icon: '📸', bg: 'rgba(0, 188, 212, 0.25)', color: '#22D3EE' },
        { id: 'files', label: 'File Services', icon: '📁', bg: 'rgba(245, 158, 11, 0.25)', color: '#FBBF24' },
        { id: 'tunnel', label: 'Device Connection', icon: '🗄️', bg: 'rgba(148, 163, 184, 0.25)', color: '#CBD5E1' },
        { id: 'users', label: 'User Management', icon: '👤', bg: 'rgba(59, 130, 246, 0.25)', color: '#60A5FA' },
      ],
    },
    {
      title: 'General & Maintenance',
      modules: [
        { id: 'hardware', label: 'Hardware & Power', icon: '🔋', bg: 'rgba(16, 185, 129, 0.25)', color: '#34D399' },
        { id: 'trash', label: 'Recycle Bin', icon: '🗑️', bg: 'rgba(239, 68, 68, 0.25)', color: '#F87171' },
        { id: 'network', label: 'Network', icon: '🌐', bg: 'rgba(59, 130, 246, 0.25)', color: '#60A5FA' },
        { id: 'security', label: 'Security', icon: '🛡️', bg: 'rgba(99, 102, 241, 0.25)', color: '#818CF8' },
        { id: 'about', label: 'About Server', icon: 'ℹ️', bg: 'rgba(168, 85, 247, 0.25)', color: '#C084FC' },
      ],
    },
  ];

  const handleModuleClick = async (modId) => {
    if (modId === 'autosync' && onOpenAutoSync) {
      onOpenAutoSync();
      return;
    }
    if (modId === 'files' && onNavigateModule) {
      onNavigateModule('files');
      return;
    }

    setActiveModal(modId);
    setModalLoading(true);

    try {
      if (modId === 'hardware' || modId === 'network' || modId === 'security' || modId === 'about') {
        const res = await fetch(`${serverUrl}/api/system`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSystemData(data);
        }
      } else if (modId === 'trash') {
        await fetchTrash();
      } else if (modId === 'tunnel') {
        const res = await fetch(`${serverUrl}/api/tunnel/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTunnelData(data);
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch module data for ${modId}:`, err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleReboot = async () => {
    Alert.alert(
      'Confirm Reboot',
      'Are you sure you want to reboot the Personal NAS server?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reboot',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const res = await fetch(`${serverUrl}/api/system/reboot`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
              });
              const data = await res.json();
              Alert.alert('Reboot Requested', data.message || 'Server reboot command sent.');
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleShutdown = async () => {
    Alert.alert(
      'Confirm Shutdown',
      'Are you sure you want to shut down the Personal NAS server?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Shutdown',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const res = await fetch(`${serverUrl}/api/system/shutdown`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
              });
              const data = await res.json();
              Alert.alert('Shutdown Requested', data.message || 'Server shutdown command sent.');
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCleanupTemp = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/system/cleanup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      Alert.alert('Temp Cleaned', `Cleaned ${data.filesCleaned || 0} temporary file(s).`);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const statusBarPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16;

  return (
    <View style={styles.container}>
      {/* ── DARK GLASS TOPBAR (SAFE FROM STATUS BAR) ─────────────────── */}
      <View style={[styles.topbar, { paddingTop: statusBarPadding }]}>
        <Text style={styles.topbarTitle}>Control Panel</Text>
        <View style={styles.topbarActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={onLogout}>
            <Text style={styles.iconText}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search Settings & Modules..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* MODULE SECTIONS */}
      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
        {sections.map((sec, secIdx) => {
          const filteredModules = sec.modules.filter(m =>
            m.label.toLowerCase().includes(searchQuery.toLowerCase())
          );
          if (filteredModules.length === 0) return null;

          return (
            <View key={secIdx} style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{sec.title}</Text>

              <View style={styles.sectionCard}>
                <View style={styles.gridRow}>
                  {filteredModules.map(mod => (
                    <TouchableOpacity
                      key={mod.id}
                      style={styles.moduleItem}
                      activeOpacity={0.7}
                      onPress={() => handleModuleClick(mod.id)}
                    >
                      <View style={[styles.moduleIconBox, { backgroundColor: mod.bg }]}>
                        <Text style={styles.moduleIcon}>{mod.icon}</Text>
                      </View>
                      <Text style={styles.moduleLabel} numberOfLines={2}>{mod.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* INTERACTIVE MODULE MODALS */}
      {activeModal && (
        <Modal
          visible={!!activeModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setActiveModal(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {activeModal === 'hardware' && '🔋 Hardware & Power'}
                  {activeModal === 'network' && '🌐 Network Configuration'}
                  {activeModal === 'security' && '🛡️ Security Settings'}
                  {activeModal === 'tunnel' && '🗄️ Cloudflare Tunnel Connection'}
                  {activeModal === 'users' && '👤 User Management'}
                  {activeModal === 'about' && 'ℹ️ About Personal NAS'}
                </Text>
                <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
                  <Text style={styles.modalCloseIcon}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                {modalLoading ? (
                  <ActivityIndicator size="large" color="#00BCD4" style={{ marginVertical: 30 }} />
                ) : (
                  <>
                    {activeModal === 'trash' && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSubTitle}>Recycle Bin Items ({trashData.length})</Text>
                        {trashData.length === 0 ? (
                          <Text style={styles.modalSubText}>No items in Recycle Bin.</Text>
                        ) : (
                          <ScrollView style={{ maxHeight: 220 }}>
                            {trashData.map(item => (
                              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                                <View style={{ flex: 1, marginRight: 8 }}>
                                  <Text style={styles.modalText} numberOfLines={1}>{item.fileName}</Text>
                                  <Text style={styles.modalSubText}>{new Date(item.deletedAt).toLocaleDateString()}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                  <TouchableOpacity style={{ backgroundColor: 'rgba(0, 188, 212, 0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }} onPress={() => handleRestoreItem(item.id)}>
                                    <Text style={{ color: '#22D3EE', fontSize: 11, fontWeight: '700' }}>Restore</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }} onPress={() => handlePurgeItem(item.id)}>
                                    <Text style={{ color: '#F87171', fontSize: 11, fontWeight: '700' }}>Purge</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        )}
                        {trashData.length > 0 && (
                          <TouchableOpacity style={styles.actionBtnDanger} onPress={() => handlePurgeItem()} disabled={actionLoading}>
                            <Text style={styles.actionBtnText}>🔥 Purge All Trash</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {activeModal === 'hardware' && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalText}>Host Platform: {systemData?.platform || 'Windows'}</Text>
                        <Text style={styles.modalText}>Uptime: {systemData?.uptime || 'N/A'}</Text>

                        <View style={styles.actionBtnRow}>
                          <TouchableOpacity style={styles.actionBtnWarning} onPress={handleCleanupTemp} disabled={actionLoading}>
                            <Text style={styles.actionBtnText}>🧹 Clean Temp Files</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.actionBtnDanger} onPress={handleReboot} disabled={actionLoading}>
                            <Text style={styles.actionBtnText}>⚡ Reboot Server</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.actionBtnDanger} onPress={handleShutdown} disabled={actionLoading}>
                            <Text style={styles.actionBtnText}>🔌 Shutdown Server</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {activeModal === 'network' && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSubTitle}>Host IP Addresses:</Text>
                        {(systemData?.ipAddresses || []).map((ip, i) => (
                          <Text key={i} style={styles.modalCode}>• http://{ip}:{systemData?.port || 3000}</Text>
                        ))}
                      </View>
                    )}

                    {activeModal === 'security' && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalText}>Active Passcode: {systemData?.passcode || '••••••'}</Text>
                        <Text style={styles.modalSubText}>JWT standard authorization active across API routes.</Text>
                      </View>
                    )}

                    {activeModal === 'tunnel' && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalText}>Status: {tunnelData?.active ? '🟢 ACTIVE' : '🔴 INACTIVE'}</Text>
                        {tunnelData?.url && (
                          <Text style={styles.modalCode}>Public URL: {tunnelData.url}</Text>
                        )}
                      </View>
                    )}

                    {activeModal === 'users' && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalText}>User Account system enabled.</Text>
                        <Text style={styles.modalSubText}>Passcode & multi-user account logins supported.</Text>
                      </View>
                    )}

                    {activeModal === 'about' && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalText}>Personal NAS Server v1.0.0</Text>
                        <Text style={styles.modalSubText}>Node.js: {systemData?.nodeVersion || process.version}</Text>
                        <Text style={styles.modalSubText}>Hostname: {systemData?.hostname || 'Localhost'}</Text>
                      </View>
                    )}
                  </>
                )}
              </View>

              <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setActiveModal(null)}>
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
    paddingBottom: 12,
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
    alignItems: 'center',
    gap: 10,
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
  searchWrap: {
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 42,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#F8FAFC',
    fontWeight: '500',
  },
  clearIcon: {
    fontSize: 14,
    color: '#94A3B8',
    padding: 4,
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 10,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  moduleItem: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  moduleIconBox: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  moduleIcon: {
    fontSize: 24,
  },
  moduleLabel: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },

  /* MODAL STYLES */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseIcon: {
    color: '#94A3B8',
    fontSize: 18,
  },
  modalBody: {
    marginBottom: 16,
  },
  modalSection: {
    gap: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  modalSubText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  modalSubTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#22D3EE',
  },
  modalCode: {
    fontSize: 13,
    color: '#00BCD4',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionBtnRow: {
    marginTop: 16,
    gap: 10,
  },
  actionBtnWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#EF4444',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
  modalDoneBtn: {
    backgroundColor: '#00BCD4',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalDoneText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14,
  },
});
