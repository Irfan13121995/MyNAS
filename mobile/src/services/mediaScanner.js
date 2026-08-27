/**
 * Local Media Scanner
 * Scans device photos/videos with expo-media-library & compares against SQLite DB
 */
import * as MediaLibrary from 'expo-media-library';
import { diffAndQueueMediaAssets, logSyncEvent } from '../database/fileRepository';

/**
 * Request Media Library permissions
 */
export async function requestMediaPermissions() {
  const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
  return {
    granted: status === 'granted',
    canAskAgain
  };
}

/**
 * Scan device media library for recent photos & videos
 */
export async function scanDeviceMedia(first = 500) {
  try {
    const { granted } = await requestMediaPermissions();
    if (!granted) {
      console.warn('[MediaScanner] Permission to access media library denied.');
      return { error: 'Permission denied', newCount: 0 };
    }

    // Query camera roll assets (photos and videos)
    const mediaResult = await MediaLibrary.getAssetsAsync({
      first,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      sortBy: [MediaLibrary.SortBy.creationTime]
    });

    const assets = mediaResult.assets || [];
    console.log(`[MediaScanner] Scanned ${assets.length} assets from device library.`);

    // Diff against SQLite database and queue unsynced items
    const diffResult = await diffAndQueueMediaAssets(assets);
    return diffResult;
  } catch (error) {
    console.error('[MediaScanner] Media scan failed:', error);
    await logSyncEvent('scan', 'Media scan failed', error.message);
    throw error;
  }
}
