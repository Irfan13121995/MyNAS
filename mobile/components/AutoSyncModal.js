import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, Modal, TouchableOpacity,
  Switch, ActivityIndicator, Alert, ScrollView, TextInput
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestMediaPermissions, getNewMediaToSync, runFullSync } from '../services/syncService';

export default function AutoSyncModal({ visible, serverUrl, token, drives, onClose }) {
  const [enabled, setEnabled] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState('');
  const [mediaType, setMediaType] = useState('both'); // 'photos' | 'videos' | 'both'
  const [syncStatus, setSyncStatus] = useState('Idle');
  const [syncedCount, setSyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFolder, setSyncFolder] = useState('');
  
  const [stats, setStats] = useState({
    totalOnDevice: 0,
    alreadySynced: 0,
    newItems: 0,
    lastSyncTime: 'Never'
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedDrive = await AsyncStorage.getItem('autosync_drive');
      const savedFolder = await AsyncStorage.getItem('autosync_folder');
      const savedEnabled = await AsyncStorage.getItem('autosync_enabled');
      const savedType = await AsyncStorage.getItem('autosync_type');
      const savedCount = await AsyncStorage.getItem('autosync_synced_count');
      const savedTime = await AsyncStorage.getItem('autosync_last_sync_time');

      if (savedDrive) setSelectedDrive(savedDrive);
      if (savedFolder) setSyncFolder(savedFolder);
      if (savedEnabled !== null) setEnabled(savedEnabled === 'true');
      if (savedType) setMediaType(savedType);
      if (savedCount) setSyncedCount(parseInt(savedCount, 10));
      
      if (savedTime) {
        setStats(prev => ({ ...prev, lastSyncTime: new Date(parseInt(savedTime, 10)).toLocaleString() }));
      }
    } catch (e) {
      console.warn('Failed to load autosync settings:', e);
    }
  };

  const saveSettings = async (drive, folder, isEnabled, type) => {
    try {
      await AsyncStorage.setItem('autosync_drive', drive);
      await AsyncStorage.setItem('autosync_folder', folder);
      await AsyncStorage.setItem('autosync_enabled', String(isEnabled));
      await AsyncStorage.setItem('autosync_type', type);
    } catch (e) {
      console.warn('Failed to save autosync settings:', e);
    }
  };

  const handleToggle = (val) => {
    setEnabled(val);
    saveSettings(selectedDrive, syncFolder, val, mediaType);
  };

  const handleDriveSelect = (driveLetter) => {
    setSelectedDrive(driveLetter);
    saveSettings(driveLetter, syncFolder, enabled, mediaType);
  };
  
  const handleFolderChange = (text) => {
    setSyncFolder(text);
    saveSettings(selectedDrive, text, enabled, mediaType);
  };

  const handleMediaTypeSelect = (type) => {
    setMediaType(type);
    saveSettings(selectedDrive, syncFolder, enabled, type);
  };

  const handleSyncNow = async () => {
    if (!syncFolder) {
      Alert.alert('Error', 'Please enter a target folder path');
      return;
    }
    
    setIsSyncing(true);
    setSyncStatus('Requesting permissions...');
    
    const hasPerm = await requestMediaPermissions();
    if (!hasPerm) {
      Alert.alert('Permission Denied', 'Media library access is required for auto-sync.');
      setIsSyncing(false);
      setSyncStatus('Idle');
      return;
    }

    try {
      setSyncStatus('Scanning phone gallery & fetching manifest...');
      const targetPath = selectedDrive ? `${selectedDrive}\\${syncFolder}` : syncFolder;
      
      const { newFiles, totalOnDevice, alreadySynced } = await getNewMediaToSync(serverUrl, token, targetPath, mediaType);
      
      setStats(prev => ({
        ...prev,
        totalOnDevice,
        alreadySynced,
        newItems: newFiles.length
      }));

      if (newFiles.length === 0) {
        setSyncStatus('Up to date');
        Alert.alert('Sync Complete', 'Everything is already backed up!');
        setIsSyncing(false);
        return;
      }

      setSyncStatus(`Uploading 1 of ${newFiles.length}...`);
      
      const result = await runFullSync(serverUrl, token, targetPath, mediaType, (progress) => {
        setSyncStatus(`Uploading ${progress.currentIndex} of ${progress.totalFiles}... (${Math.round(progress.currentFileProgress * 100)}%)`);
      });

      setSyncStatus('Auto-Sync Complete');
      setSyncedCount(prev => prev + result.synced);
      Alert.alert('Sync Complete', `${result.synced} items backed up successfully! ${result.failed > 0 ? `(${result.failed} failed)` : ''}`);
      
      const savedTime = await AsyncStorage.getItem('autosync_last_sync_time');
      if (savedTime) {
         setStats(prev => ({ ...prev, lastSyncTime: new Date(parseInt(savedTime, 10)).toLocaleString() }));
      }
      
    } catch (e) {
      console.warn('Sync error', e);
      setSyncStatus('Sync Failed');
      Alert.alert('Error', 'An error occurred during sync');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>🖼️ Phone Gallery Auto-Sync</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            {/* Auto-Sync Toggle Row */}
            <View style={styles.settingCard}>
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>Auto-Sync Gallery</Text>
                  <Text style={styles.rowSub}>Automatically upload new photos/videos to NAS</Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={handleToggle}
                  trackColor={{ false: '#334155', true: 'rgba(0, 188, 212, 0.4)' }}
                  thumbColor={enabled ? '#00BCD4' : '#94A3B8'}
                />
              </View>
            </View>

            {/* Target Drive Selector */}
            <Text style={styles.sectionTitle}>Select Storage Drive</Text>
            <View style={styles.driveList}>
              {drives.map((d) => {
                const isSelected = selectedDrive === d.letter || (!selectedDrive && d === drives[0]);
                return (
                  <TouchableOpacity
                    key={d.letter}
                    style={[styles.driveItem, isSelected && styles.driveItemSelected]}
                    onPress={() => handleDriveSelect(d.letter)}
                  >
                    <Text style={styles.driveIcon}>💾</Text>
                    <View style={styles.driveMeta}>
                      <Text style={styles.driveName}>{d.name || d.letter} ({d.letter})</Text>
                    </View>
                    {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            
            <Text style={styles.sectionTitle}>Target Folder Path</Text>
            <View style={{ marginBottom: 20 }}>
               <View style={styles.driveItem}>
                 <Text style={{color:'#94A3B8', marginRight:8}}>{selectedDrive ? selectedDrive + '\\' : ''}</Text>
                 <TextInput
                    style={{ flex: 1, color: '#F8FAFC', fontSize: 14 }}
                    placeholder="e.g. Gallery_Backup"
                    placeholderTextColor="#475569"
                    value={syncFolder}
                    onChangeText={handleFolderChange}
                 />
               </View>
            </View>

            {/* Media Type Selector */}
            <Text style={styles.sectionTitle}>Media to Backup</Text>
            <View style={styles.typeRow}>
              {[
                { key: 'photos', label: 'Photos Only', icon: '🖼️' },
                { key: 'videos', label: 'Videos Only', icon: '🎬' },
                { key: 'both', label: 'Photos & Videos', icon: '📸' },
              ].map((item) => {
                const isSelected = mediaType === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.typeBtn, isSelected && styles.typeBtnSelected]}
                    onPress={() => handleMediaTypeSelect(item.key)}
                  >
                    <Text style={styles.typeIcon}>{item.icon}</Text>
                    <Text style={[styles.typeLabel, isSelected && styles.typeLabelSelected]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Status Summary Card */}
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Sync Status:</Text>
                <Text style={styles.statusVal}>{syncStatus}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Total Uploaded:</Text>
                <Text style={styles.statusVal}>{syncedCount} items</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Target Folder:</Text>
                <Text style={styles.statusVal}>{selectedDrive ? `${selectedDrive}\\${syncFolder}` : syncFolder}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Device Photos:</Text>
                <Text style={styles.statusVal}>{stats.totalOnDevice}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Already Backed Up:</Text>
                <Text style={styles.statusVal}>{stats.alreadySynced}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>New Items:</Text>
                <Text style={styles.statusVal}>{stats.newItems}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Last Sync:</Text>
                <Text style={styles.statusVal}>{stats.lastSyncTime}</Text>
              </View>

              {isSyncing ? (
                <View style={styles.syncingBox}>
                  <ActivityIndicator size="small" color="#00BCD4" />
                  <Text style={styles.syncingText}>Syncing in progress...</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.syncNowBtn} onPress={handleSyncNow} activeOpacity={0.85}>
                  <Text style={styles.syncNowText}>⚡ Sync Gallery Now</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#94A3B8',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  settingCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowInfo: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  rowSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  driveList: {
    marginBottom: 20,
  },
  driveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  driveItemSelected: {
    borderColor: '#00BCD4',
    backgroundColor: 'rgba(0, 188, 212, 0.18)',
  },
  driveIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  driveMeta: {
    flex: 1,
  },
  driveName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  driveSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  checkIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#22D3EE',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    paddingVertical: 12,
  },
  typeBtnSelected: {
    borderColor: '#00BCD4',
    backgroundColor: 'rgba(0, 188, 212, 0.18)',
  },
  typeIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  typeLabelSelected: {
    color: '#22D3EE',
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  statusVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  syncingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  syncingText: {
    fontSize: 13,
    color: '#00BCD4',
    fontWeight: '600',
  },
  syncNowBtn: {
    backgroundColor: '#00BCD4',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  syncNowText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
});
