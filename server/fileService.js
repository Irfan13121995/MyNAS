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

  let formatted = targetPath;
  if (/^[a-zA-Z]:$/.test(formatted)) {
    formatted += '\\';
  }

  const resolvedPath = path.resolve(formatted);
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
  if (depth > 4 || mediaList.length >= 300) return mediaList;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (mediaList.length >= 300) break;

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

/**
 * Collects all media files across all or specific registered NAS drives.
 */
async function getMediaGallery(targetDrive = null) {
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

  // Sort by modification date descending (newest first)
  return allMedia.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

module.exports = {
  validatePath,
  listFiles,
  getMediaGallery
};
