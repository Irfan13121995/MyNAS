import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, View, Text, Modal, TouchableOpacity,
  Switch, ActivityIndicator, Alert, ScrollView, TextInput
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { requestMediaPermissions, getNewMediaToSync, runFullSync, validateTargetNASFolder } from '../services/syncService';
import { useTheme } from '../contexts/ThemeContext';

export default function AutoSyncModal({ visible, serverUrl, token, drives, onClose }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [enabled, setEnabled] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [chargingOnly, setChargingOnly] = useState(false);
  const [lowBatteryPause, setLowBatteryPause] = useState(true);
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

  const [folderStructure, setFolderStructure] = useState('flat'); // 'flat' | 'album' | 'date'
  const [targetValidation, setTargetValidation] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedDrive = await AsyncStorage.getItem('autosync_drive');
      const savedFolder = await AsyncStorage.getItem('autosync_folder');
      const savedEnabled = await AsyncStorage.getItem('autosync_enabled');
      const savedType = await AsyncStorage.getItem('autosync_type');
      const savedStruct = await AsyncStorage.getItem('autosync_folder_structure');
      const savedCount = await AsyncStorage.getItem('autosync_synced_count');
      const savedTime = await AsyncStorage.getItem('autosync_last_sync_time');

      const savedWifi = await AsyncStorage.getItem('autosync_wifi_only');
      const savedCharging = await AsyncStorage.getItem('autosync_charging_only');
      const savedLowBat = await AsyncStorage.getItem('autosync_low_battery_pause');

      const deviceName = Device.modelName || Device.deviceName || 'Android Phone';
      const defaultFolder = `Mobile Backups\\${deviceName}\\Photos`;

      if (savedDrive) setSelectedDrive(savedDrive);
      if (savedFolder) setSyncFolder(savedFolder);
      else setSyncFolder(defaultFolder);
      if (savedEnabled !== null) setEnabled(savedEnabled === 'true');
      if (savedType) setMediaType(savedType);
      if (savedStruct) setFolderStructure(savedStruct);
      if (savedCount) setSyncedCount(parseInt(savedCount, 10));

      if (savedWifi !== null) setWifiOnly(savedWifi === 'true');
      if (savedCharging !== null) setChargingOnly(savedCharging === 'true');
      if (savedLowBat !== null) setLowBatteryPause(savedLowBat === 'true');

      if (savedTime) {
        setStats(prev => ({ ...prev, lastSyncTime: new Date(parseInt(savedTime, 10)).toLocaleString() }));
      }
    } catch (e) {
      console.warn('Failed to load autosync settings:', e);
    }
  };

  const saveSettings = async (drive, folder, isEnabled, type, wOnly = wifiOnly, cOnly = chargingOnly, lbPause = lowBatteryPause, struct = folderStructure) => {
    try {
      await AsyncStorage.setItem('autosync_drive', drive);
      await AsyncStorage.setItem('autosync_folder', folder);
      await AsyncStorage.setItem('autosync_enabled', String(isEnabled));
      await AsyncStorage.setItem('autosync_type', type);
      await AsyncStorage.setItem('autosync_folder_structure', struct);
      await AsyncStorage.setItem('autosync_wifi_only', String(wOnly));
      await AsyncStorage.setItem('autosync_charging_only', String(cOnly));
      await AsyncStorage.setItem('autosync_low_battery_pause', String(lbPause));
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

  const handleFolderStructureSelect = (struct) => {
    setFolderStructure(struct);
    saveSettings(selectedDrive, syncFolder, enabled, mediaType, wifiOnly, chargingOnly, lowBatteryPause, struct);
  };

  const handleSyncNow = async () => {
    if (!syncFolder) {
      Alert.alert('Error', 'Please enter a target folder path');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('Validating NAS storage target...');

    try {
      const targetPath = selectedDrive ? `${selectedDrive}\\${syncFolder}` : syncFolder;

      // 1. Validate NAS target path & free disk space
      const validation = await validateTargetNASFolder(serverUrl, token, targetPath);
      if (!validation.valid || !validation.writable) {
        setIsSyncing(false);
        setSyncStatus('Target invalid');
        Alert.alert('NAS Target Error', validation.error || 'The target NAS folder is invalid or not writable.');
        return;
      }

      setSyncStatus('Preparing gallery sync...');

      const result = await runFullSync(serverUrl, token, targetPath, mediaType, (progress) => {
        setSyncStatus(`Uploading ${progress.currentIndex} of ${progress.totalFiles}... (${Math.round(progress.currentFileProgress * 100)}%)`);
      });

      if (result.cancelled) {
        setIsSyncing(false);
        setSyncStatus('Idle');
        return;
      }

      if (result.synced === 0 && result.failed === 0 && result.skipped > 0) {
        setSyncStatus('Up to date');
        Alert.alert('Sync Complete', 'Everything is already backed up!');
      } else {
        setSyncStatus('Auto-Sync Complete');
        setSyncedCount(prev => prev + (result.synced || 0));
        Alert.alert('Sync Complete', `${result.synced || 0} items backed up successfully to NAS! ${result.failed > 0 ? `(${result.failed} failed)` : ''}`);
      }

      const savedTime = await AsyncStorage.getItem('autosync_last_sync_time');
      if (savedTime) {
        setStats(prev => ({ ...prev, lastSyncTime: new Date(parseInt(savedTime, 10)).toLocaleString() }));
      }
    } catch (err) {
      console.warn('Sync error:', err);
      Alert.alert('Sync Error', err.message || 'Failed to complete gallery sync.');
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
                  trackColor={{ false: colors.borderLight, true: colors.accentBg }}
                  thumbColor={enabled ? colors.accent : colors.textMuted}
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
                 <Text style={{color: colors.textSecondary, marginRight:8}}>{selectedDrive ? selectedDrive + '\\' : ''}</Text>
                 <TextInput
                    style={{ flex: 1, color: colors.textPrimary, fontSize: 14 }}
                    placeholder="e.g. Gallery_Backup"
                    placeholderTextColor={colors.textMuted}
                    value={syncFolder}
                    onChangeText={handleFolderChange}
                 />
               </View>
            </View>

            {/* Folder Structure Selector */}
            <Text style={styles.sectionTitle}>Folder Organization Structure</Text>
            <View style={styles.typeRow}>
              {[
                { key: 'flat', label: 'Flat (Photos)', icon: '📁' },
                { key: 'album', label: 'By Album', icon: '🖼️' },
                { key: 'date', label: 'By YYYY/MM', icon: '📅' },
              ].map((item) => {
                const isSelected = folderStructure === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.typeBtn, isSelected && styles.typeBtnSelected]}
                    onPress={() => handleFolderStructureSelect(item.key)}
                  >
                    <Text style={styles.typeIcon}>{item.icon}</Text>
                    <Text style={[styles.typeLabel, isSelected && styles.typeLabelSelected]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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

            {/* Power & Network Constraints */}
            <Text style={styles.sectionTitle}>Network & Battery Conditions</Text>
            <View style={styles.constraintBox}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Wi-Fi Only Sync</Text>
                  <Text style={styles.toggleSub}>Avoid using cellular mobile data</Text>
                </View>
                <Switch
                  value={wifiOnly}
                  onValueChange={(val) => {
                    setWifiOnly(val);
                    saveSettings(selectedDrive, syncFolder, enabled, mediaType, val, chargingOnly, lowBatteryPause);
                  }}
                  trackColor={{ false: colors.borderLight, true: colors.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Sync Only While Charging</Text>
                  <Text style={styles.toggleSub}>Only run backups when plugged into power</Text>
                </View>
                <Switch
                  value={chargingOnly}
                  onValueChange={(val) => {
                    setChargingOnly(val);
                    saveSettings(selectedDrive, syncFolder, enabled, mediaType, wifiOnly, val, lowBatteryPause);
                  }}
                  trackColor={{ false: colors.borderLight, true: colors.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Pause on Low Battery (&lt;20%)</Text>
                  <Text style={styles.toggleSub}>Pause background sync when battery is low</Text>
                </View>
                <Switch
                  value={lowBatteryPause}
                  onValueChange={(val) => {
                    setLowBatteryPause(val);
                    saveSettings(selectedDrive, syncFolder, enabled, mediaType, wifiOnly, chargingOnly, val);
                  }}
                  trackColor={{ false: colors.borderLight, true: colors.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>
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
                  <ActivityIndicator size="small" color={colors.accent} />
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

const getStyles = (colors) => StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  settingCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
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
    color: colors.textPrimary,
  },
  rowSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
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
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  driveItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentBg,
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
    color: colors.textPrimary,
  },
  driveSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  checkIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accentLight,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 12,
  },
  typeBtnSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentBg,
  },
  typeIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  typeLabelSelected: {
    color: colors.accentLight,
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statusVal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
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
    color: colors.accent,
    fontWeight: '600',
  },
  syncNowBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  syncNowText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '800',
  },
  constraintBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  toggleSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
