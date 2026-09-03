import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, View, Text, Modal, TouchableOpacity,
  Switch, ActivityIndicator, Alert, ScrollView, TextInput
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { requestMediaPermissions, getNewMediaToSync, runFullSync, validateTargetNASFolder } from '../services/syncService';
import { useTheme } from '../contexts/ThemeContext';
import FileExplorerModal from './FileExplorerModal';

export default function AutoSyncModal({ visible, serverUrl, token, drives = [], onClose }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [enabled, setEnabled] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [chargingOnly, setChargingOnly] = useState(false);
  const [lowBatteryPause, setLowBatteryPause] = useState(true);
  const [selectedDrive, setSelectedDrive] = useState('');
  const [raidVolumes, setRaidVolumes] = useState([]);
  const [syncFolder, setSyncFolder] = useState('');
  const [mediaType, setMediaType] = useState('both'); // 'photos' | 'videos' | 'both'
  const [folderStructure, setFolderStructure] = useState('flat'); // 'flat' | 'album' | 'date'
  
  const [syncStatus, setSyncStatus] = useState('Idle');
  const [syncedCount, setSyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [stats, setStats] = useState({
    totalOnDevice: 0,
    alreadySynced: 0,
    newItems: 0,
    lastSyncTime: 'Never'
  });

  const [targetValidation, setTargetValidation] = useState(null);
  const [validatingTarget, setValidatingTarget] = useState(false);
  const [folderExplorerVisible, setFolderExplorerVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  useEffect(() => {
    if (visible && (selectedDrive || syncFolder)) {
      validateTarget();
    }
  }, [visible, selectedDrive, syncFolder]);

  const loadSettings = async () => {
    try {
      // Fetch RAID storage pools
      let foundRaidVols = [];
      if (serverUrl && token) {
        try {
          const rRes = await fetch(`${serverUrl}/api/raid/volumes`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (rRes.ok) {
            const rData = await rRes.json();
            foundRaidVols = Array.isArray(rData.volumes) ? rData.volumes : (Array.isArray(rData) ? rData : []);
            setRaidVolumes(foundRaidVols);
          }
        } catch (e) {}
      }

      // 1. Try loading remote settings from server SQLite first
      let remoteSettings = null;
      if (serverUrl && token) {
        try {
          const res = await fetch(`${serverUrl}/api/sync/settings`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            remoteSettings = await res.json();
          }
        } catch (e) {
          console.warn('Failed to load remote sync settings:', e);
        }
      }

      // 2. Fallback to AsyncStorage local cache
      const savedEnabled = await AsyncStorage.getItem('autosync_enabled');
      const savedDrive = await AsyncStorage.getItem('autosync_target_drive');
      const savedFolder = await AsyncStorage.getItem('autosync_target_folder');
      const savedType = await AsyncStorage.getItem('autosync_media_type');
      const savedStruct = await AsyncStorage.getItem('autosync_folder_structure');
      const savedCount = await AsyncStorage.getItem('autosync_synced_count');
      const savedTime = await AsyncStorage.getItem('autosync_last_sync_time');

      const savedWifi = await AsyncStorage.getItem('autosync_wifi_only');
      const savedCharging = await AsyncStorage.getItem('autosync_charging_only');
      const savedLowBat = await AsyncStorage.getItem('autosync_low_battery_pause');

      const deviceName = (Device.deviceName || Device.modelName || 'Android_Phone').replace(/[^a-zA-Z0-9_-]/g, '_');
      const defaultFolder = `NAS_Backup\\${deviceName}`;

      const defaultDrive = (foundRaidVols.length > 0 ? `raid:${foundRaidVols[0].id}` : (drives[0]?.letter || ''));
      const activeDrive = remoteSettings?.targetDrive ?? savedDrive ?? defaultDrive;
      const activeFolder = remoteSettings?.targetFolderPath ?? savedFolder ?? defaultFolder;

      setSelectedDrive(activeDrive);
      setSyncFolder(activeFolder);
      
      if (savedEnabled !== null) setEnabled(savedEnabled === 'true');
      if (savedType || remoteSettings?.mediaType) setMediaType(remoteSettings?.mediaType || savedType);
      if (savedStruct || remoteSettings?.folderStructure) setFolderStructure(remoteSettings?.folderStructure || savedStruct);
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

  const validateTarget = async () => {
    if (!serverUrl || !token) return;
    setValidatingTarget(true);
    const targetPath = selectedDrive ? `${selectedDrive.replace(/[\/\\]+$/, '')}\\${syncFolder.replace(/^[\/\\]+/, '')}` : syncFolder;
    try {
      const res = await validateTargetNASFolder(serverUrl, token, targetPath);
      setTargetValidation(res);
    } catch (e) {
      setTargetValidation({ valid: false, error: e.message });
    } finally {
      setValidatingTarget(false);
    }
  };

  const saveSettings = async (drive, folder, isEnabled, type, wOnly = wifiOnly, cOnly = chargingOnly, lbPause = lowBatteryPause, struct = folderStructure) => {
    try {
      await AsyncStorage.setItem('autosync_drive', drive || '');
      await AsyncStorage.setItem('autosync_folder', folder || '');
      await AsyncStorage.setItem('autosync_enabled', String(isEnabled));
      await AsyncStorage.setItem('autosync_type', type);
      await AsyncStorage.setItem('autosync_folder_structure', struct);
      await AsyncStorage.setItem('autosync_wifi_only', String(wOnly));
      await AsyncStorage.setItem('autosync_charging_only', String(cOnly));
      await AsyncStorage.setItem('autosync_low_battery_pause', String(lbPause));

      // Push settings to server SQLite database
      if (serverUrl && token) {
        fetch(`${serverUrl}/api/sync/settings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            targetDrive: drive || '',
            targetFolderPath: folder || '',
            folderStructure: struct,
            mediaType: type,
            wifiOnly: wOnly,
            chargingOnly: cOnly,
            lowBatteryPause: lbPause
          })
        }).catch(() => {});
      }
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

  const handleFolderPicked = (selectedPath) => {
    // Strip drive letter if included in path
    let relPath = selectedPath;
    if (selectedDrive && selectedPath.toUpperCase().startsWith(selectedDrive.toUpperCase())) {
      relPath = selectedPath.substring(selectedDrive.length).replace(/^[\/\\]+/, '');
    }
    setSyncFolder(relPath);
    saveSettings(selectedDrive, relPath, enabled, mediaType);
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
      const fullTargetPath = selectedDrive ? `${selectedDrive.replace(/[\/\\]+$/, '')}\\${syncFolder.replace(/^[\/\\]+/, '')}` : syncFolder;

      // 1. Validate NAS target path & free disk space
      const validation = await validateTargetNASFolder(serverUrl, token, fullTargetPath);
      if (!validation.valid || !validation.writable) {
        setIsSyncing(false);
        setSyncStatus('Target invalid');
        Alert.alert('NAS Target Error', validation.error || 'The target NAS folder is invalid or not writable.');
        return;
      }

      setSyncStatus('Preparing gallery sync...');

      const result = await runFullSync(serverUrl, token, fullTargetPath, mediaType, (progress) => {
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

  const formatBytesGB = (bytes) => {
    if (!bytes) return 'N/A';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const initialExplorerPath = selectedDrive 
    ? `${selectedDrive.replace(/[\/\\]+$/, '')}\\${syncFolder.replace(/^[\/\\]+/, '')}` 
    : (drives[0]?.letter ? `${drives[0].letter}\\` : 'C:\\');

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
              {/* RAID Storage Pools */}
              {raidVolumes.map((vol) => {
                const volKey = `raid:${vol.id}`;
                const isSelected = selectedDrive === volKey;
                return (
                  <TouchableOpacity
                    key={volKey}
                    style={[
                      styles.driveItem,
                      { borderColor: 'rgba(16, 185, 129, 0.4)' },
                      isSelected && { borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)' }
                    ]}
                    onPress={() => handleDriveSelect(volKey)}
                  >
                    <Text style={styles.driveIcon}>🛡️</Text>
                    <View style={styles.driveMeta}>
                      <Text style={styles.driveName}>{vol.name} (RAID 1 Mirror)</Text>
                      <Text style={[styles.driveSub, { color: '#10B981', fontWeight: '700' }]}>
                        {vol.usable_capacity_formatted || '931.5 GB'} • Healthy Mirrored Pool
                      </Text>
                    </View>
                    {isSelected && <Text style={[styles.checkIcon, { color: '#10B981' }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}

              {/* Physical Drives */}
              {drives.map((d) => {
                const isSelected = selectedDrive === d.letter || (!selectedDrive && d.letter === drives[0]?.letter);
                return (
                  <TouchableOpacity
                    key={d.letter}
                    style={[styles.driveItem, isSelected && styles.driveItemSelected]}
                    onPress={() => handleDriveSelect(d.letter)}
                  >
                    <Text style={styles.driveIcon}>💾</Text>
                    <View style={styles.driveMeta}>
                      <Text style={styles.driveName}>{d.name || d.letter} ({d.letter})</Text>
                      <Text style={styles.driveSub}>{formatBytesGB(d.free)} free of {formatBytesGB(d.total)}</Text>
                    </View>
                    {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            
            {/* Target Folder Selector with FileExplorerModal Picker */}
            <Text style={styles.sectionTitle}>Target Folder Path</Text>
            <View style={{ marginBottom: 16 }}>
               <View style={styles.folderInputRow}>
                 <Text style={styles.drivePrefixText}>
                   {selectedDrive ? (typeof selectedDrive === 'string' && selectedDrive.startsWith('raid:') ? (raidVolumes.find(v => 'raid:' + v.id === selectedDrive)?.name || 'myNAS') + '\\' : selectedDrive.replace(/[:/\\]+$/, '') + ':\\') : ''}
                 </Text>
                 <TextInput
                    style={styles.folderTextInput}
                    placeholder="e.g. Mobile Backups\Photos"
                    placeholderTextColor={colors.textMuted}
                    value={syncFolder}
                    onChangeText={handleFolderChange}
                 />
                 <TouchableOpacity style={styles.browseBtn} onPress={() => setFolderExplorerVisible(true)}>
                   <Text style={styles.browseBtnText}>📁 Browse</Text>
                 </TouchableOpacity>
               </View>
            </View>

            {/* Real-time Target Validation Status */}
            <View style={[
              styles.validationCard,
              targetValidation?.valid && targetValidation?.writable ? styles.valCardSuccess : styles.valCardWarning
            ]}>
              <View style={styles.valHeader}>
                <Text style={styles.valTitle}>
                  {validatingTarget ? '⏳ Validating NAS Target...' : (targetValidation?.valid && targetValidation?.writable ? '✅ Target Ready' : '⚠️ Storage Warning')}
                </Text>
                {validatingTarget && <ActivityIndicator size="small" color={colors.accent} />}
              </View>
              {targetValidation && (
                <View style={styles.valBody}>
                  <Text style={styles.valText}>• Path: {targetValidation.path || 'Invalid'}</Text>
                  <Text style={styles.valText}>• Status: {targetValidation.writable ? 'Writable' : 'Access Denied / Read Only'}</Text>
                  <Text style={styles.valText}>• Available Space: {formatBytesGB(targetValidation.freeBytes)}</Text>
                </View>
              )}
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
                <Text style={styles.statusLabel}>Target Path:</Text>
                <Text style={styles.statusVal} numberOfLines={1}>{selectedDrive ? `${selectedDrive}\\${syncFolder}` : syncFolder}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Action Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.syncNowBtn, isSyncing && styles.syncNowBtnDisabled]}
              onPress={handleSyncNow}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.syncNowText}>⚡ Start Manual Sync Now</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Target Folder Picker Modal */}
      <FileExplorerModal
        visible={folderExplorerVisible}
        initialPath={initialExplorerPath}
        serverUrl={serverUrl}
        token={token}
        mode="selectFolder"
        onSelectFolder={handleFolderPicked}
        onClose={() => setFolderExplorerVisible(false)}
      />
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
    height: '92%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  body: {
    flex: 1,
    padding: 20,
  },
  settingCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowInfo: {
    flex: 1,
    paddingRight: 16,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  rowSub: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  driveList: {
    marginBottom: 20,
  },
  driveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  driveItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentBg,
  },
  driveIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  driveMeta: {
    flex: 1,
  },
  driveName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  driveSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  checkIcon: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: 'bold',
  },
  folderInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    height: 48
  },
  drivePrefixText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4
  },
  folderTextInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    height: '100%'
  },
  browseBtn: {
    backgroundColor: colors.accentBg,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8
  },
  browseBtnText: {
    color: colors.accent,
    fontWeight: 'bold',
    fontSize: 12
  },
  validationCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1
  },
  valCardSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderColor: '#4CAF50'
  },
  valCardWarning: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderColor: '#FF9800'
  },
  valHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  valTitle: {
    color: colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 13
  },
  valBody: {
    marginTop: 2
  },
  valText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2
  },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
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
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  typeLabelSelected: {
    color: colors.accent,
    fontWeight: 'bold',
  },
  constraintBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  statusVal: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.card,
  },
  syncNowBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  syncNowBtnDisabled: {
    opacity: 0.6,
  },
  syncNowText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
