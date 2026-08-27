/**
 * File Repository for Offline-First Storage & Sync Management
 */
import { getDatabase } from './index';

/**
 * Get all files with a specific sync status (e.g. 'pending', 'failed', 'completed')
 */
export async function getFilesByStatus(status, limit = 100) {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT * FROM files_metadata WHERE sync_status = ? ORDER BY creation_time DESC LIMIT ?`,
    [status, limit]
  );
}

/**
 * Get pending and eligible retry items for the upload queue
 */
export async function getQueueItems(maxRetries = 5, limit = 50) {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT * FROM files_metadata 
     WHERE sync_status = 'pending' 
        OR (sync_status = 'failed' AND retry_count < ?) 
     ORDER BY retry_count ASC, creation_time DESC 
     LIMIT ?`,
    [maxRetries, limit]
  );
}

/**
 * Get recently synced completed files for UI dashboard
 */
export async function getRecentlySyncedFiles(limit = 20) {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT * FROM files_metadata 
     WHERE sync_status = 'completed' 
     ORDER BY last_synced_at DESC 
     LIMIT ?`,
    [limit]
  );
}

/**
 * Get sync queue statistics (total, pending, syncing, completed, failed)
 */
export async function getSyncStats() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT sync_status, COUNT(*) as count, SUM(file_size) as total_bytes 
     FROM files_metadata 
     GROUP BY sync_status`
  );

  const stats = {
    total: 0,
    pending: 0,
    syncing: 0,
    completed: 0,
    failed: 0,
    totalBytes: 0,
    syncedBytes: 0
  };

  rows.forEach(r => {
    stats.total += r.count;
    stats.totalBytes += (r.total_bytes || 0);
    if (r.sync_status === 'pending') stats.pending = r.count;
    if (r.sync_status === 'syncing') stats.syncing = r.count;
    if (r.sync_status === 'completed') {
      stats.completed = r.count;
      stats.syncedBytes += (r.total_bytes || 0);
    }
    if (r.sync_status === 'failed') stats.failed = r.count;
  });

  return stats;
}

/**
 * Update file status during upload lifecycle
 */
export async function updateSyncStatus(assetId, status, remotePath = null, errorMessage = null) {
  const db = await getDatabase();
  const now = Date.now();

  if (status === 'completed') {
    await db.runAsync(
      `UPDATE files_metadata 
       SET sync_status = 'completed', remote_path = ?, error_message = NULL, last_synced_at = ?, updated_at = ? 
       WHERE asset_id = ?`,
      [remotePath || '', now, now, assetId]
    );
  } else if (status === 'failed') {
    await db.runAsync(
      `UPDATE files_metadata 
       SET sync_status = 'failed', error_message = ?, retry_count = retry_count + 1, updated_at = ? 
       WHERE asset_id = ?`,
      [errorMessage || 'Unknown upload failure', now, assetId]
    );
  } else {
    await db.runAsync(
      `UPDATE files_metadata 
       SET sync_status = ?, updated_at = ? 
       WHERE asset_id = ?`,
      [status, now, assetId]
    );
  }
}

/**
 * Diffs scanned local media library assets against SQLite database
 * Inserts only brand new, unsynced items into files_metadata
 */
export async function diffAndQueueMediaAssets(localAssets) {
  if (!localAssets || localAssets.length === 0) return { newCount: 0, totalScanned: 0 };
  const db = await getDatabase();
  let newCount = 0;

  // Retrieve existing asset IDs
  const existingRows = await db.getAllAsync(`SELECT asset_id FROM files_metadata`);
  const existingSet = new Set(existingRows.map(r => r.asset_id));

  for (const asset of localAssets) {
    if (!existingSet.has(asset.id)) {
      const mediaType = asset.mediaType === 'video' ? 'video' : 'photo';
      const filename = asset.filename || `media_${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;
      const creationTime = asset.creationTime || Date.now();
      const fileSize = asset.fileSize || 0;
      const duration = asset.duration || 0;

      await db.runAsync(
        `INSERT OR IGNORE INTO files_metadata 
         (asset_id, filename, local_uri, media_type, file_size, duration, creation_time, sync_status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [asset.id, filename, asset.uri, mediaType, fileSize, duration, creationTime, Date.now(), Date.now()]
      );
      newCount++;
    }
  }

  if (newCount > 0) {
    await logSyncEvent('scan', `Identified and queued ${newCount} new media items for backup`, `Total scanned: ${localAssets.length}`);
  }

  return { newCount, totalScanned: localAssets.length };
}

/**
 * Reset failed items to 'pending' to retry backup
 */
export async function retryFailedItems() {
  const db = await getDatabase();
  const res = await db.runAsync(
    `UPDATE files_metadata 
     SET sync_status = 'pending', error_message = NULL, updated_at = ? 
     WHERE sync_status = 'failed'`,
    [Date.now()]
  );
  return res.changes;
}

/**
 * Clear all completed items from local database
 */
export async function clearCompletedRecords() {
  const db = await getDatabase();
  const res = await db.runAsync(`DELETE FROM files_metadata WHERE sync_status = 'completed'`);
  return res.changes;
}

/**
 * Get setting value by key
 */
export async function getSetting(key, defaultValue = null) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(`SELECT value FROM sync_settings WHERE key = ?`, [key]);
  return row ? row.value : defaultValue;
}

/**
 * Set setting value
 */
export async function setSetting(key, value) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_settings (key, value, updated_at) VALUES (?, ?, ?)`,
    [key, String(value), Date.now()]
  );
}

/**
 * Append an event to sync_logs
 */
export async function logSyncEvent(eventType, message, details = '') {
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO sync_logs (event_type, message, details, timestamp) VALUES (?, ?, ?, ?)`,
      [eventType, message, details, Date.now()]
    );
  } catch (e) {
    console.warn('[SyncLog] Failed to write sync log:', e);
  }
}

/**
 * Get recent activity logs
 */
export async function getRecentSyncLogs(limit = 30) {
  const db = await getDatabase();
  return await db.getAllAsync(`SELECT * FROM sync_logs ORDER BY timestamp DESC LIMIT ?`, [limit]);
}
