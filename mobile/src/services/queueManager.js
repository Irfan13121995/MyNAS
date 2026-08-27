/**
 * Upload Queue Manager
 * Processes pending items sequentially with exponential backoff & tunnel retry logic
 */
import * as Network from 'expo-network';
import { getQueueItems, updateSyncStatus, logSyncEvent, getSetting } from '../database/fileRepository';
import { uploadFileMultipart } from './api';

let isQueueProcessing = false;
let currentAbortSignal = false;

// Event listeners for UI updates
const listeners = new Set();

export function subscribeQueueEvents(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function emitQueueEvent(event) {
  listeners.forEach(cb => {
    try { cb(event); } catch (e) {}
  });
}

/**
 * Start processing the pending upload queue
 */
export async function processUploadQueue() {
  if (isQueueProcessing) {
    console.log('[Queue] Already processing.');
    return;
  }

  // Check network connectivity
  const netState = await Network.getNetworkStateAsync();
  if (!netState.isConnected || !netState.isInternetReachable) {
    console.log('[Queue] Device is offline. Pausing queue.');
    emitQueueEvent({ type: 'network_offline' });
    return;
  }

  // Check WiFi only setting
  const wifiOnly = (await getSetting('sync_on_wifi_only', 'false')) === 'true';
  if (wifiOnly && netState.type !== Network.NetworkStateType.WIFI) {
    console.log('[Queue] WiFi-only sync is enabled, skipping on cellular.');
    emitQueueEvent({ type: 'wifi_required' });
    return;
  }

  isQueueProcessing = true;
  currentAbortSignal = false;
  emitQueueEvent({ type: 'sync_started' });

  try {
    const maxRetries = parseInt(await getSetting('max_retries', '5'), 10);
    const queue = await getQueueItems(maxRetries, 100);

    if (queue.length === 0) {
      console.log('[Queue] No pending items to sync.');
      emitQueueEvent({ type: 'sync_idle' });
      isQueueProcessing = false;
      return;
    }

    console.log(`[Queue] Processing ${queue.length} queue items...`);

    for (let i = 0; i < queue.length; i++) {
      if (currentAbortSignal) {
        console.log('[Queue] Queue cancelled by user.');
        break;
      }

      const item = queue[i];
      emitQueueEvent({ 
        type: 'file_syncing', 
        item, 
        index: i + 1, 
        total: queue.length,
        progress: 0 
      });

      // Mark item as 'syncing'
      await updateSyncStatus(item.asset_id, 'syncing');

      try {
        const uploadResult = await uploadFileMultipart(item, (progress) => {
          emitQueueEvent({ 
            type: 'file_progress', 
            item, 
            index: i + 1, 
            total: queue.length, 
            progress: progress.percent 
          });
        });

        // Mark as completed
        await updateSyncStatus(item.asset_id, 'completed', uploadResult.remotePath);
        emitQueueEvent({ type: 'file_completed', item, index: i + 1, total: queue.length });
        await logSyncEvent('upload_success', `Backed up: ${item.filename}`);

      } catch (uploadError) {
        console.warn(`[Queue] Failed to upload ${item.filename}:`, uploadError.message);
        await updateSyncStatus(item.asset_id, 'failed', null, uploadError.message);
        emitQueueEvent({ type: 'file_failed', item, error: uploadError.message });
        await logSyncEvent('upload_error', `Failed: ${item.filename}`, uploadError.message);

        // Exponential backoff pause if network or tunnel disconnected
        if (uploadError.message.includes('Network') || uploadError.message.includes('timeout')) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    emitQueueEvent({ type: 'sync_finished' });
  } catch (queueError) {
    console.error('[Queue] Queue processor encountered an error:', queueError);
    emitQueueEvent({ type: 'sync_error', error: queueError.message });
  } finally {
    isQueueProcessing = false;
  }
}

/**
 * Cancel the currently running upload queue
 */
export function cancelUploadQueue() {
  currentAbortSignal = true;
  isQueueProcessing = false;
  emitQueueEvent({ type: 'sync_cancelled' });
}

export function isQueueRunning() {
  return isQueueProcessing;
}
