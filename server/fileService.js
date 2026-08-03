const fs = require('fs').promises;
const path = require('path');
const { getDrives } = require('./driveService');
const driveConfig = require('./driveConfigService');

const MEDIA_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v'
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

/**
 * Recursively scans a directory for photos and videos.
 */
async function scanMediaDirectory(dirPath, driveLetter, mediaList = [], depth = 0) {
  if (depth > 6 || mediaList.length >= 5000) return mediaList;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (mediaList.length >= 5000) break;

      // Skip system, hidden, cache, and heavy program folders
      const lowerName = entry.name.toLowerCase();
      if (entry.name.startsWith('.') || entry.name.startsWith('$') ||
          lowerName === 'node_modules' || lowerName === 'appdata' ||
          lowerName === 'windows' || lowerName === 'program files' ||
          lowerName === 'program files (x86)' || lowerName === 'programdata' ||
          lowerName === 'system volume information' || lowerName === 'recovery') {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await scanMediaDirectory(fullPath, driveLetter, mediaList, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (MEDIA_EXTENSIONS.has(ext)) {
          try {
            const stats = await fs.stat(fullPath);
            const isVideo = ['.mp4','.mkv','.avi','.mov','.wmv','.webm','.m4v'].includes(ext);
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
  } catch (err) {}

  return mediaList;
}

let mediaGalleryCache = { data: null, timestamp: 0, targetDrive: null };
const GALLERY_CACHE_TTL = 5000; // 5 seconds in-memory TTL cache
let pendingScanPromise = null;

/**
 * Collects all media files across all or specific registered NAS drives.
 */
async function getMediaGallery(targetDrive = null) {
  const now = Date.now();
  if (
    mediaGalleryCache.data &&
    mediaGalleryCache.targetDrive === targetDrive &&
    now - mediaGalleryCache.timestamp < GALLERY_CACHE_TTL
  ) {
    return mediaGalleryCache.data;
  }

  const cacheKey = targetDrive || '__all__';
  if (pendingScanPromise && pendingScanPromise.key === cacheKey) {
    return pendingScanPromise.promise;
  }

  const scanPromise = (async () => {
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

    let allMedia = [];
    for (const drive of drivesToScan) {
      const driveMedia = await scanMediaDirectory(drive.letter + path.sep, drive.letter);
      allMedia = allMedia.concat(driveMedia);
    }

    const sortedMedia = allMedia.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    mediaGalleryCache = { data: sortedMedia, timestamp: Date.now(), targetDrive };
    return sortedMedia;
  })();

  pendingScanPromise = { key: cacheKey, promise: scanPromise };
  try {
    return await scanPromise;
  } finally {
    pendingScanPromise = null;
  }
}

/**
 * Recursive search directory scanner across files & folders.
 */
async function scanSearchDirectory(dirPath, queryLower, results, depth = 0) {
  if (depth > 6 || results.length >= 100) return results;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= 100) break;
      // Skip system or hidden folders
      if (entry.name.startsWith('$') || entry.name.startsWith('.') || entry.name === 'System Volume Information' || entry.name === 'node_modules') continue;

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
        await scanSearchDirectory(fullPath, queryLower, results, depth + 1);
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
    if (results.length >= 100) break;
    await scanSearchDirectory(drive.letter + path.sep, queryLower, results, 0);
  }

  return results;
}

module.exports = {
  validatePath,
  listFiles,
  getMediaGallery,
  searchFiles
};
