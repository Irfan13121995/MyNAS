/**
 * Background Task Manager & Background Fetch Module
 * Runs periodic background scans & backup sync
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { scanDeviceMedia } from './mediaScanner';
import { processUploadQueue } from './queueManager';
import { logSyncEvent, getSetting } from '../database/fileRepository';

export const BACKGROUND_SYNC_TASK = 'PERSONAL_NAS_BACKGROUND_SYNC_TASK';

/**
 * Define the background sync task with TaskManager
 */
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  const now = new Date().toISOString();
  console.log(`[BackgroundFetch] Triggered at ${now}`);

  try {
    const autoSync = (await getSetting('auto_sync_enabled', 'true')) === 'true';
    if (!autoSync) {
      console.log('[BackgroundFetch] Auto sync is disabled in settings.');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 1. Scan for new media
    const scanRes = await scanDeviceMedia(200);

    // 2. Process queue
    await processUploadQueue();

    await logSyncEvent('bg_task', 'Background sync executed successfully', `New items: ${scanRes.newCount || 0}`);
    return scanRes.newCount > 0 
      ? BackgroundFetch.BackgroundFetchResult.NewData 
      : BackgroundFetch.BackgroundFetchResult.NoData;

  } catch (error) {
    console.error('[BackgroundFetch] Task failed:', error);
    await logSyncEvent('bg_task', 'Background sync failed', error.message);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register Background Task with system
 */
export async function registerBackgroundSyncTask(intervalMinutes = 15) {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: 60 * intervalMinutes, // seconds
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log(`[BackgroundFetch] Task registered with ${intervalMinutes}m interval.`);
    }
  } catch (err) {
    console.warn('[BackgroundFetch] Registration failed:', err);
  }
}

/**
 * Unregister Background Task
 */
export async function unregisterBackgroundSyncTask() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      console.log('[BackgroundFetch] Task unregistered.');
    }
  } catch (err) {
    console.warn('[BackgroundFetch] Unregistration failed:', err);
  }
}
