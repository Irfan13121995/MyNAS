const fs = require('fs').promises;
const path = require('path');
const { getDrives } = require('./driveService');

/**
 * Validates a path to prevent directory traversal and verify it resides on an active drive.
 * @param {string} targetPath The absolute path to validate.
 * @returns {Promise<string>} The resolved path if valid.
 */
async function validatePath(targetPath) {
  if (!targetPath) {
    throw new Error('Path is required');
  }

  // Normalize to absolute path
  const resolvedPath = path.resolve(targetPath);
  
  // Retrieve list of active drives
  const drives = await getDrives();
  const driveLetters = drives.map(d => d.letter.toUpperCase()); // e.g., ["C:", "D:"]
  
  // Extract drive prefix (e.g., "C:")
  const targetDrive = resolvedPath.substring(0, 2).toUpperCase();
  
  if (!driveLetters.includes(targetDrive)) {
    throw new Error('Access Denied: Path resides on an invalid or disconnected drive');
  }
  
  return resolvedPath;
}

/**
 * Lists contents of a directory.
 * @param {string} dirPath Normalized absolute path to list.
 * @returns {Promise<Array<{name: string, isDirectory: boolean, size: number, modifiedAt: Date, ext: string}>>}
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
      // Silently skip files/folders with permission errors
      continue;
    }
  }
  
  // Sort: directories first, then alphabetical by name
  return results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

module.exports = {
  validatePath,
  listFiles
};
