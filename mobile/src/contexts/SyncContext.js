/**
 * Live Sync State & Queue Progress Context
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSyncStats, retryFailedItems } from '../database/fileRepository';
import { scanDeviceMedia } from '../services/mediaScanner';
import { processUploadQueue, cancelUploadQueue, subscribeQueueEvents, isQueueRunning } from '../services/queueManager';

const SyncContext = createContext({
  isSyncing: false,
  currentFile: null,
  progress: 0,
  syncStats: { total: 0, pending: 0, syncing: 0, completed: 0, failed: 0, totalBytes: 0, syncedBytes: 0 },
  startScanAndSync: async () => {},
  cancelSync: () => {},
  retryFailed: async () => {},
  refreshStats: async () => {}
});

export const SyncProvider = ({ children }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [syncStats, setSyncStats] = useState({
    total: 0,
    pending: 0,
    syncing: 0,
    completed: 0,
    failed: 0,
    totalBytes: 0,
    syncedBytes: 0
  });

  const refreshStats = async () => {
    try {
      const stats = await getSyncStats();
      setSyncStats(stats);
    } catch (e) {}
  };

  useEffect(() => {
    refreshStats();

    const unsubscribe = subscribeQueueEvents((event) => {
      if (event.type === 'sync_started') {
        setIsSyncing(true);
      } else if (event.type === 'file_syncing') {
        setCurrentFile(event.item);
        setProgress(event.progress || 0);
      } else if (event.type === 'file_progress') {
        setProgress(event.progress || 0);
      } else if (event.type === 'file_completed' || event.type === 'file_failed') {
        refreshStats();
      } else if (event.type === 'sync_finished' || event.type === 'sync_cancelled' || event.type === 'sync_idle') {
        setIsSyncing(false);
        setCurrentFile(null);
        setProgress(0);
        refreshStats();
      }
    });

    return () => unsubscribe();
  }, []);

  const startScanAndSync = async () => {
    try {
      setIsSyncing(true);
      await scanDeviceMedia(300);
      await refreshStats();
      await processUploadQueue();
    } catch (e) {
      console.warn('[SyncContext] Sync failed:', e);
    } finally {
      setIsSyncing(isQueueRunning());
      refreshStats();
    }
  };

  const cancelSync = () => {
    cancelUploadQueue();
    setIsSyncing(false);
  };

  const retryFailed = async () => {
    await retryFailedItems();
    await refreshStats();
    await processUploadQueue();
  };

  return (
    <SyncContext.Provider value={{
      isSyncing,
      currentFile,
      progress,
      syncStats,
      startScanAndSync,
      cancelSync,
      retryFailed,
      refreshStats
    }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);
