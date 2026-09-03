import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');
const GAP = 3;
const COLUMN_WIDTH = (width - 32 - GAP * 2) / 3;

export default function BackupPanel({ serverUrl, token, drives = [], onClose }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deviceName, setDeviceName] = useState('MobileDevice');
  const [selectedDrive, setSelectedDrive] = useState('');
  const [raidVolumes, setRaidVolumes] = useState([]);

  // Media & Sync State
  const [allMedia, setAllMedia] = useState([]);
  const [syncedIdsSet, setSyncedIdsSet] = useState(new Set());
  const [currentSyncingId, setCurrentSyncingId] = useState(null);

  // Sync execution state
  const [syncing, setSyncing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalToSync, setTotalToSync] = useState(0);
  const [syncLog, setSyncLog] = useState('');

  // 1. Initialize, check permissions & resolve device info
  useEffect(() => {
    const initialize = async () => {
      try {
        const rawName = Device.deviceName || Device.modelName || 'Android_Phone';
        const sanitized = rawName.replace(/[^a-zA-Z0-9_-]/g, '_');
        setDeviceName(sanitized);

        // Fetch RAID storage pools
        if (serverUrl && token) {
          try {
            const raidRes = await fetch(`${serverUrl}/api/raid/volumes`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (raidRes.ok) {
              const raidData = await raidRes.json();
              const vols = Array.isArray(raidData.volumes) ? raidData.volumes : (Array.isArray(raidData) ? raidData : []);
              setRaidVolumes(vols);
              if (vols.length > 0) {
                // Default to active RAID storage pool!
                setSelectedDrive(`raid:${vols[0].id}`);
              }
            }
          } catch (e) {
            console.warn('Failed to fetch RAID volumes for backup:', e);
          }
        }

        // Pick preferred destination drive if RAID not selected
        setSelectedDrive(prev => {
          if (prev) return prev;
          if (drives && drives.length > 0) {
            const usbDrive = drives.find(d => d.isUsb);
            const defDrive = usbDrive || drives[0];
            return defDrive.letter || defDrive.path || 'C:';
          }
          return 'C:';
        });

        // Request modern media permissions (only photos & videos, avoid requesting audio)
        let perm = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
        if (!perm.granted && perm.status !== 'granted') {
          perm = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
        }
        if (perm.granted || perm.status === 'granted' || perm.accessPrivileges === 'all' || perm.accessPrivileges === 'limited') {
          setPermissionGranted(true);
          await loadMediaStoreAndCache(sanitized);
        } else {
          setPermissionGranted(false);
        }
      } catch (err) {
        console.warn('BackupPanel initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [drives, serverUrl, token]);

  // 2. Direct MediaStore Query (Photos + Videos) & Sync Cache
  const loadMediaStoreAndCache = async (devName) => {
    try {
      setLoading(true);
      // Load synced IDs from local storage (incremental tracking)
      const savedIdsJson = await AsyncStorage.getItem(`nas_backup_synced_${devName}`);
      const syncedArr = savedIdsJson ? JSON.parse(savedIdsJson) : [];
      const syncedSet = new Set(syncedArr);
      setSyncedIdsSet(syncedSet);

      // Direct MediaStore query
      let fetched = [];
      let hasNextPage = true;
      let endCursor = undefined;

      while (hasNextPage && fetched.length < 5000) {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: ['photo', 'video'],
          first: 100,
          after: endCursor,
          sortBy: ['creationTime']
        });
        fetched = fetched.concat(page.assets || []);
        hasNextPage = page.hasNextPage;
        endCursor = page.endCursor;
      }

      setAllMedia(fetched);
    } catch (err) {
      console.warn('Error loading MediaStore assets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPermission = async () => {
    try {
      const res = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      if (res.granted || res.status === 'granted' || res.accessPrivileges === 'all' || res.accessPrivileges === 'limited') {
        setPermissionGranted(true);
        await loadMediaStoreAndCache(deviceName);
      } else {
        Alert.alert('Permission Denied', 'Please enable media permissions in system settings to allow auto-backup.');
      }
    } catch (e) {
      console.warn('handleRequestPermission error:', e);
      Alert.alert('Permission Error', e.message || 'Could not request permissions.');
    }
  };

  // 3. Destination Display & Background Sync Execution
  const pendingItems = useMemo(() => {
    return allMedia.filter(item => !syncedIdsSet.has(item.id));
  }, [allMedia, syncedIdsSet]);

  const destinationDisplay = useMemo(() => {
    if (!selectedDrive) return 'Select Storage';
    if (typeof selectedDrive === 'string' && selectedDrive.startsWith('raid:')) {
      const volId = selectedDrive.replace(/^raid:/, '');
      const vol = raidVolumes.find(v => v.id === volId || v.name === volId);
      const name = vol ? vol.name : 'myNAS';
      return `${name} [RAID 1 Mirror]\\NAS_Backup\\${deviceName}\\`;
    }
    const cleanDrive = typeof selectedDrive === 'string' ? selectedDrive.replace(/[:/\\]+$/, '') + ':' : 'C:';
    return `${cleanDrive}\\NAS_Backup\\${deviceName}\\`;
  }, [selectedDrive, raidVolumes, deviceName]);

  const startBackupSync = async () => {
    if (!selectedDrive) {
      Alert.alert('Select Drive', 'Please select a destination NAS drive.');
      return;
    }

    if (!permissionGranted) {
      handleRequestPermission();
      return;
    }

    if (pendingItems.length === 0) {
      Alert.alert('All Photos Synced', 'Every photo and video on your device is already backed up!');
      return;
    }

    setSyncing(true);
    setTotalToSync(pendingItems.length);
    setCurrentProgress(0);
    setSyncLog('Connecting to NAS server...');

    const cleanDrive = typeof selectedDrive === 'string' ? selectedDrive.replace(/[:/\\]+$/, '') + ':' : 'C:';
    const targetPath = (selectedDrive && typeof selectedDrive === 'string' && selectedDrive.startsWith('raid:'))
      ? `${selectedDrive}\\NAS_Backup\\${deviceName}`
      : `${cleanDrive}\\NAS_Backup\\${deviceName}`;
    const updatedSyncedSet = new Set(syncedIdsSet);
    let successCount = 0;

    try {
      for (let i = 0; i < pendingItems.length; i++) {
        const asset = pendingItems[i];
        setCurrentSyncingId(asset.id);
        setCurrentProgress(i + 1);
        setSyncLog(`Uploading (${i + 1}/${pendingItems.length}): ${asset.filename}`);

        let fileUri = asset.uri;
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
          if (assetInfo && (assetInfo.localUri || assetInfo.uri)) {
            fileUri = assetInfo.localUri || assetInfo.uri;
          }
        } catch (e) {
          // If getAssetInfoAsync fails or throws missing ACCESS_MEDIA_LOCATION, fallback directly to asset.uri
          fileUri = asset.uri;
        }

        if (!fileUri) {
          continue;
        }

        try {
          const formData = new FormData();
          const ext = asset.filename ? asset.filename.split('.').pop() : (asset.mediaType === 'video' ? 'mp4' : 'jpg');
          formData.append('file', {
            uri: fileUri,
            name: asset.filename || `backup_${Date.now()}.${ext}`,
            type: asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'
          });

          const uploadUrl = `${serverUrl}/api/upload?destination=${encodeURIComponent(targetPath)}`;
          const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            },
            body: formData
          });

          const resData = await response.json().catch(() => ({}));

          if (response.ok && (resData.success || resData.path)) {
            successCount++;
            updatedSyncedSet.add(asset.id);
            setSyncedIdsSet(new Set(updatedSyncedSet));

            // Save progress incrementally
            await AsyncStorage.setItem(`nas_backup_synced_${deviceName}`, JSON.stringify(Array.from(updatedSyncedSet)));
          }
        } catch (fileErr) {
          console.warn(`Failed to upload ${asset.filename}:`, fileErr);
        }
      }

      setCurrentSyncingId(null);
      setSyncLog(`✅ Backup completed! ${successCount} files backed up.`);
      Alert.alert('Backup Complete', `Successfully uploaded ${successCount} photos & videos to:\n${destinationDisplay}`);
    } catch (err) {
      Alert.alert('Backup Interrupted', err.message || 'An error occurred during upload.');
    } finally {
      setSyncing(false);
      setCurrentSyncingId(null);
    }
  };

  const progressPct = totalToSync > 0 ? Math.round((currentProgress / totalToSync) * 100) : 0;

  // 4. Render Media Item with Live Sync Status Badge
  const renderMediaItem = useCallback(({ item }) => {
    const isSynced = syncedIdsSet.has(item.id);
    const isCurrentlySyncing = currentSyncingId === item.id;
    const isVideo = item.mediaType === 'video';

    return (
      <View style={styles.gridItem}>
        <Image
          source={{ uri: item.uri }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={150}
          diskCachePolicy="always"
        />

        {/* Video Duration / Badge */}
        {isVideo && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>
              {item.duration ? `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}` : 'VID'}
            </Text>
          </View>
        )}

        {/* Google Photos-Style Sync Status Indicator */}
        <View style={styles.syncBadgeContainer}>
          {isCurrentlySyncing ? (
            <View style={[styles.statusCircle, { backgroundColor: colors.accent }]}>
              <ActivityIndicator size="small" color="#0F172A" style={{ transform: [{ scale: 0.7 }] }} />
            </View>
          ) : isSynced ? (
            <View style={[styles.statusCircle, { backgroundColor: colors.success }]}>
              <Text style={styles.statusCheck}>✓</Text>
            </View>
          ) : (
            <View style={[styles.statusCircle, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.4)', borderWidth: 1 }]}>
              <Text style={styles.statusPending}>☁️</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, [syncedIdsSet, currentSyncingId, colors]);

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Indexing device photos & videos...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: colors.topbar, borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={syncing}>
          <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>✕ Close</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Auto-Backup Center</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => loadMediaStoreAndCache(deviceName)}
          disabled={syncing}
        >
          <Text style={{ fontSize: 16 }}>↻</Text>
        </TouchableOpacity>
      </View>

      {!permissionGranted ? (
        <View style={styles.centerContainer}>
          <Text style={{ fontSize: 54, marginBottom: 16 }}>📸</Text>
          <Text style={[styles.unsupportedTitle, { color: colors.textPrimary }]}>Media Permissions Required</Text>
          <Text style={[styles.unsupportedSub, { color: colors.textSecondary }]}>
            myNAS needs access to your photos and videos to automatically index and back them up in the background.
          </Text>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.accent }]} onPress={handleRequestPermission}>
            <Text style={styles.actionBtnText}>Grant Photos Permission</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
          {/* ── TOP BACKUP CONTROL CARD ── */}
          <View style={[styles.controlCard, { backgroundColor: colors.surfaceSolid, borderColor: colors.borderLight }]}>
            <View style={styles.cardHeaderCol}>
              <View style={styles.destHeaderRow}>
                <Text style={[styles.destLabel, { color: colors.textSecondary }]}>DESTINATION DIRECTORY</Text>
                {selectedDrive && typeof selectedDrive === 'string' && selectedDrive.startsWith('raid:') && (
                  <View style={styles.raidActiveBadge}>
                    <Text style={styles.raidActiveBadgeText}>🛡️ RAID 1 Mirrored</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.destPath, { color: colors.accent }]} numberOfLines={1}>
                {destinationDisplay}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.drivePickerScroll}
                contentContainerStyle={styles.drivePickerContainer}
              >
                {/* Active RAID Storage Pools */}
                {raidVolumes.map(vol => {
                  const volKey = `raid:${vol.id}`;
                  const isSel = selectedDrive === volKey;
                  return (
                    <TouchableOpacity
                      key={volKey}
                      style={[
                        styles.drivePill,
                        styles.raidPill,
                        isSel && styles.raidPillActive
                      ]}
                      onPress={() => setSelectedDrive(volKey)}
                      disabled={syncing}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.drivePillText, isSel && styles.raidPillTextActive]}>
                        🛡️ {vol.name} (RAID 1)
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Physical Drives */}
                {drives.map(d => {
                  const dLetter = d.letter || d.path || 'C:';
                  const isSel = selectedDrive === dLetter;
                  return (
                    <TouchableOpacity
                      key={dLetter}
                      style={[styles.drivePill, isSel && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                      onPress={() => setSelectedDrive(dLetter)}
                      disabled={syncing}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.drivePillText, isSel && { color: '#0F172A', fontWeight: '700' }]}>
                        {d.name || dLetter}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Sync Counters */}
            <View style={styles.counterRow}>
              <View style={styles.counterItem}>
                <Text style={[styles.counterNumber, { color: colors.success }]}>
                  {syncedIdsSet.size}
                </Text>
                <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>☁️ Synced</Text>
              </View>
              <View style={styles.counterItem}>
                <Text style={[styles.counterNumber, { color: pendingItems.length > 0 ? colors.warning : colors.textMuted }]}>
                  {pendingItems.length}
                </Text>
                <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>⏳ Pending</Text>
              </View>
              <View style={styles.counterItem}>
                <Text style={[styles.counterNumber, { color: colors.textPrimary }]}>
                  {allMedia.length}
                </Text>
                <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>📱 On Device</Text>
              </View>
            </View>

            {/* Progress Bar when Syncing */}
            {syncing && (
              <View style={{ marginTop: 14 }}>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${progressPct}%`, backgroundColor: colors.accent }]} />
                </View>
                <Text style={[styles.logText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {syncLog} ({progressPct}%)
                </Text>
              </View>
            )}

            {/* Action Sync Button */}
            {!syncing ? (
              <TouchableOpacity
                style={[
                  styles.syncActionBtn,
                  { backgroundColor: pendingItems.length === 0 ? colors.surfaceHighlight : colors.accent }
                ]}
                onPress={startBackupSync}
                disabled={pendingItems.length === 0}
              >
                <Text style={[styles.syncActionBtnText, { color: pendingItems.length === 0 ? colors.textMuted : '#0F172A' }]}>
                  {pendingItems.length === 0 ? '✓ All Photos Backed Up' : `Start Auto-Backup (${pendingItems.length} new)`}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.syncActionBtn, { backgroundColor: colors.warning }]}>
                <ActivityIndicator size="small" color="#0F172A" style={{ marginRight: 8 }} />
                <Text style={[styles.syncActionBtnText, { color: '#0F172A' }]}>Backing up in background...</Text>
              </View>
            )}
          </View>

          {/* ── IN-APP GALLERY GRID HEADER ── */}
          <View style={styles.galleryHeaderRow}>
            <Text style={[styles.gallerySectionTitle, { color: colors.textPrimary }]}>Device Photos & Videos</Text>
            <Text style={[styles.gallerySectionSub, { color: colors.textSecondary }]}>
              {allMedia.length} items discovered
            </Text>
          </View>

          {/* ── IN-APP GALLERY FLASH LIST ── */}
          <View style={{ flex: 1, marginTop: 8 }}>
            <FlashList
              data={allMedia}
              extraData={{ syncedIdsSet, currentSyncingId }}
              keyExtractor={(item) => item.id}
              numColumns={3}
              estimatedItemSize={COLUMN_WIDTH + GAP}
              renderItem={renderMediaItem}
              contentContainerStyle={{ paddingBottom: 30 }}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.02,
  },
  refreshBtn: {
    padding: 6,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
    fontWeight: '600',
  },
  unsupportedTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  unsupportedSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    maxWidth: 300,
  },
  actionBtn: {
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  actionBtnText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14,
  },
  controlCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardHeaderCol: {
    marginBottom: 12,
  },
  destHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  raidActiveBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  raidActiveBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  destLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.05,
  },
  destPath: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  drivePickerScroll: {
    marginTop: 10,
    marginHorizontal: -4,
  },
  drivePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 8,
  },
  raidPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  raidPillActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  raidPillTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  drivePill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  drivePillText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginVertical: 4,
  },
  counterItem: {
    alignItems: 'center',
  },
  counterNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  counterLabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  logText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 10,
  },
  syncActionBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  syncActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  galleryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  gallerySectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  gallerySectionSub: {
    fontSize: 12,
    fontWeight: '600',
  },
  gridItem: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH,
    margin: GAP / 2,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  syncBadgeContainer: {
    position: 'absolute',
    top: 5,
    right: 5,
  },
  statusCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCheck: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  statusPending: {
    fontSize: 9,
  },
});
