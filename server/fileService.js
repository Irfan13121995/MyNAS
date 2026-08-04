const fs = require('fs').promises;
const path = require('path');
const { getDrives } = require('./driveService');
const driveConfig = require('./driveConfigService');

const MEDIA_EXTENSIONS = new Set([
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif', '.avif', '.tif', '.tiff', '.dng', '.cr2', '.nef', '.arw',
  // Videos
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.3gp', '.flv', '.mts', '.m2ts', '.ts', '.vob', '.ogv'
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.3gp', '.flv', '.mts', '.m2ts', '.ts', '.vob', '.ogv'
]);

/**
 * Validates a path to prevent directory traversal and verify it resides on an active drive.
 */
async function validatePath(targetPath) {
  if (!targetPath) {
    throw new Error('Path is required');
  }

  // Security Hardening: Prevent Null-Byte Injection & Traversal Attacks
  if (targetPath.includes('\0') || targetPath.includes('%00')) {
    throw new Error('Access Denied: Malformed path string detected');
  }

  let formatted = targetPath;
  if (/^[a-zA-Z]:$/.test(formatted)) {
    formatted += '\\';
  }

  const resolvedPath = path.resolve(formatted);

  // Enforce Path Traversal Check
  if (targetPath.includes('..') && !resolvedPath.startsWith(path.normalize(formatted))) {
    throw new Error('Access Denied: Directory traversal is forbidden');
  }

  const drives = await getDrives();
  const driveLetters = drives.map(d => d.letter.toUpperCase().replace(/[\/\\]+$/, ''));
  const targetDrive = resolvedPath.substring(0, 2).toUpperCase();
  
  if (!driveLetters.includes(targetDrive)) {
    throw new Error('Access Denied: Path resides on an invalid or disconnected drive');
  }
  
  return resolvedPath;
}

/**
 * Lists contents of a directory.
 */
async function listFiles(dirPath) {
  const validatedPath = await validatePath(dirPath);
  const entries = await fs.readdir(validatedPath, { withFileTypes: true });
  
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(validatedPath, entry.name);
    try {
      const stats = await fs.stat(fullPath);
      results.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime,
        ext: entry.isDirectory() ? '' : path.extname(entry.name).toLowerCase()
      });
    } catch (err) {
      continue;
    }
  }
  
  return results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CACHE_DIR = path.join(BASE_DIR, '.nas_cache');
const MEDIA_CACHE_FILE = path.join(CACHE_DIR, 'media_cache.json');

let globalMediaList = [];
let lastScanTimestamp = 0;
let isScanning = false;

// Ensure .nas_cache directory exists and load persistent cache on load
(async () => {
  try {
    const fsSync = require('fs');
    if (!fsSync.existsSync(CACHE_DIR)) {
      fsSync.mkdirSync(CACHE_DIR, { recursive: true });
    }
    if (fsSync.existsSync(MEDIA_CACHE_FILE)) {
      const raw = fsSync.readFileSync(MEDIA_CACHE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) {
        globalMediaList = parsed.items;
        lastScanTimestamp = parsed.timestamp || Date.now();
        console.log(`[MediaCache] Loaded ${globalMediaList.length} items from persistent disk cache.`);
      }
    }
  } catch (err) {
    console.warn('[MediaCache] Error loading persistent cache:', err.message);
  }
})();

async function saveMediaCacheToDisk(items) {
  try {
    const fsSync = require('fs');
    if (!fsSync.existsSync(CACHE_DIR)) {
      fsSync.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const payload = JSON.stringify({ timestamp: Date.now(), items }, null, 2);
    await fs.writeFile(MEDIA_CACHE_FILE, payload, 'utf8');
  } catch (err) {
    console.warn('[MediaCache] Failed to save persistent cache:', err.message);
  }
}

/**
 * Priority media directory check for faster targeted scanning.
 */
function isPriorityMediaDir(dirName) {
  const lower = dirName.toLowerCase();
  return lower === 'pictures' || lower === 'videos' || lower === 'dcim' ||
         lower === 'photos' || lower === 'camera' || lower === 'downloads' ||
         lower === 'desktop' || lower === 'users' || lower === 'mobile backups' ||
         lower === 'onedrive' || lower === 'media' || lower === 'gallery';
}

/**
 * Recursively scans a directory for photos and videos with parallel traversal.
 */
async function scanMediaDirectory(dirPath, driveLetter, mediaList = [], depth = 0, maxDepth = 10, maxItems = 100000) {
  if (depth > maxDepth || mediaList.length >= maxItems) return mediaList;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const subdirs = [];

    for (const entry of entries) {
      if (mediaList.length >= maxItems) break;

      const lowerName = entry.name.toLowerCase();
      // Skip system, hidden, cache, build, and OS system folders
      if (entry.name.startsWith('.') || entry.name.startsWith('$') ||
          lowerName === 'node_modules' || lowerName === 'appdata' ||
          lowerName === 'windows' || lowerName === 'program files' ||
          lowerName === 'program files (x86)' || lowerName === 'programdata' ||
          lowerName === 'system volume information' || lowerName === 'recovery' ||
          lowerName === 'recycler' || lowerName === '$recycle.bin' || lowerName === 'temp') {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const nextMaxDepth = isPriorityMediaDir(entry.name) ? 12 : Math.min(maxDepth, 6);
        subdirs.push({ fullPath, nextMaxDepth });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (MEDIA_EXTENSIONS.has(ext)) {
          try {
            const stats = await fs.stat(fullPath);
            const isVideo = VIDEO_EXTENSIONS.has(ext);
            const folderPath = path.dirname(fullPath);
            mediaList.push({
              name: entry.name,
              path: fullPath,
              folderPath: folderPath,
              drive: driveLetter,
              isDirectory: false,
              isVideo,
              size: stats.size,
              modifiedAt: stats.mtime,
              ext: ext.replace('.', '')
            });
          } catch (e) {}
        }
      }
    }

    // Traverse subdirectories in parallel chunks (up to 5 concurrently)
    const chunkSize = 5;
    for (let i = 0; i < subdirs.length && mediaList.length < maxItems; i += chunkSize) {
      const chunk = subdirs.slice(i, i + chunkSize);
      await Promise.all(chunk.map(sub => scanMediaDirectory(sub.fullPath, driveLetter, mediaList, depth + 1, sub.nextMaxDepth, maxItems)));
    }
  } catch (err) {}

  return mediaList;
}

/**
 * Triggers a full background rescan across all registered NAS drives and custom paths.
 */
async function rescanMediaGallery() {
  if (isScanning) return globalMediaList;
  isScanning = true;

  console.log('[MediaCache] Starting background media scan...');
  try {
    const allDrives = await getDrives();
    const allowedPaths = driveConfig.getAllowedPaths();
    const customPaths = driveConfig.getCustomPaths() || [];

    let drivesToScan = allDrives;
    if (allowedPaths !== null) {
      drivesToScan = allDrives.filter(d =>
        allowedPaths.includes(d.letter) || allowedPaths.includes(d.letter + '\\')
      );
    }

    let allMedia = [];
    for (const drive of drivesToScan) {
      const driveMedia = await scanMediaDirectory(drive.letter + path.sep, drive.letter, [], 0, 10, 100000);
      allMedia = allMedia.concat(driveMedia);
    }

    for (const customItem of customPaths) {
      if (customItem && customItem.path) {
        try {
          const customMedia = await scanMediaDirectory(customItem.path, customItem.label || 'Custom Path', [], 0, 12, 100000);
          allMedia = allMedia.concat(customMedia);
        } catch (e) {}
      }
    }

    // Deduplicate items by unique path
    const seenPaths = new Set();
    const uniqueMedia = [];
    for (const item of allMedia) {
      if (!seenPaths.has(item.path)) {
        seenPaths.add(item.path);
        uniqueMedia.push(item);
      }
    }

    const sortedMedia = uniqueMedia.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    globalMediaList = sortedMedia;
    lastScanTimestamp = Date.now();

    await saveMediaCacheToDisk(globalMediaList);
    console.log(`[MediaCache] Background scan finished: ${globalMediaList.length} items cached.`);
  } catch (err) {
    console.warn('[MediaCache] Background scan error:', err.message);
  } finally {
    isScanning = false;
  }

  return globalMediaList;
}

/**
 * Collects all media files across all or specific registered NAS drives.
 * Returns cached items immediately (< 5ms) and triggers background refresh if stale.
 */
async function getMediaGallery(targetDrive = null) {
  const now = Date.now();

  // If cache is empty or older than 2 minutes, trigger a background rescan non-blockingly
  if (globalMediaList.length === 0 || now - lastScanTimestamp > 120000) {
    rescanMediaGallery();
  }

  // Filter cached items by target drive
  let items = globalMediaList;
  if (targetDrive && targetDrive !== 'ALL') {
    const normalizedTarget = targetDrive.toUpperCase().replace(/[/\\]+$/, '');
    items = items.filter(item => item.drive && item.drive.toUpperCase().startsWith(normalizedTarget));
  }

  return items;
}

/**
 * Recursive search directory scanner across files & folders up to 25 levels.
 */
async function scanSearchDirectory(dirPath, queryLower, results, depth = 0, maxDepth = 25, maxResults = 1000) {
  if (depth > maxDepth || results.length >= maxResults) return results;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      // Skip system or hidden folders
      const lowerName = entry.name.toLowerCase();
      if (entry.name.startsWith('$') || entry.name.startsWith('.') || lowerName === 'system volume information' || lowerName === 'node_modules' || lowerName === 'appdata' || lowerName === 'windows') continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.name.toLowerCase().includes(queryLower)) {
        try {
          const stats = await fs.stat(fullPath);
          results.push({
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: stats.size,
            modifiedAt: stats.mtime,
            ext: path.extname(entry.name).toLowerCase()
          });
        } catch (e) {}
      }

      if (entry.isDirectory()) {
        await scanSearchDirectory(fullPath, queryLower, results, depth + 1, maxDepth, maxResults);
      }
    }
  } catch (err) {}

  return results;
}

/**
 * Searches for files/folders matching query across ALL active registered NAS drives.
 */
async function searchFiles(query, targetDrive = null) {
  if (!query || !query.trim()) return [];
  const queryLower = query.trim().toLowerCase();

  const allDrives = await getDrives();
  const allowedPaths = driveConfig.getAllowedPaths();

  let drivesToScan = allDrives;
  if (allowedPaths !== null) {
    drivesToScan = allDrives.filter(d =>
      allowedPaths.includes(d.letter) || allowedPaths.includes(d.letter + '\\')
    );
  }

  if (targetDrive && targetDrive !== 'ALL') {
    const normalizedTarget = targetDrive.toUpperCase().replace(/[/\\]+$/, '');
    drivesToScan = drivesToScan.filter(d => d.letter.toUpperCase().startsWith(normalizedTarget));
  }

  let results = [];
  for (const drive of drivesToScan) {
    if (results.length >= 1000) break;
    await scanSearchDirectory(drive.letter + path.sep, queryLower, results, 0, 25, 1000);
  }

  return results;
}

module.exports = {
  validatePath,
  listFiles,
  getMediaGallery,
  rescanMediaGallery,
  searchFiles
};
