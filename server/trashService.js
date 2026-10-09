const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.NAS_DATA_DIR || __dirname;
const TRASH_DIR = path.join(DATA_DIR, '.nas_trash');
const TRASH_FILES_DIR = path.join(TRASH_DIR, 'files');
const MANIFEST_FILE = path.join(TRASH_DIR, 'manifest.json');

/**
 * Ensures trash storage directory and manifest file exist.
 */
function ensureTrashDirs() {
  if (!fs.existsSync(TRASH_FILES_DIR)) {
    fs.mkdirSync(TRASH_FILES_DIR, { recursive: true });
  }
  if (!fs.existsSync(MANIFEST_FILE)) {
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify([]), 'utf8');
  }
}

/**
 * Reads the trash manifest.
 * @returns {Array<object>} List of items in trash.
 */
function getManifest() {
  ensureTrashDirs();
  try {
    const data = fs.readFileSync(MANIFEST_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (e) {
    return [];
  }
}

/**
 * Saves items list to the trash manifest.
 * @param {Array<object>} items
 */
function saveManifest(items) {
  ensureTrashDirs();
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(items, null, 2), 'utf8');
}

/**
 * Moves a file to the NAS trash bin.
 * @param {string} filePath Absolute path to file.
 * @param {string} [owner] Username of the file owner.
 * @returns {object} Trash item details.
 */
function moveToTrash(filePath, owner = 'system') {
  ensureTrashDirs();
  if (!fs.existsSync(filePath)) {
    throw new Error('File does not exist');
  }

  const id = crypto.randomBytes(8).toString('hex');
  const fileName = path.basename(filePath);
  const trashPath = path.join(TRASH_FILES_DIR, `${id}_${fileName}`);

  // Rename / move file to trash
  fs.renameSync(filePath, trashPath);

  const manifest = getManifest();
  const trashItem = {
    id,
    originalPath: filePath,
    fileName,
    trashPath,
    owner: owner || 'system',
    deletedAt: new Date().toISOString(),
    size: fs.existsSync(trashPath) ? fs.statSync(trashPath).size : 0
  };

  manifest.push(trashItem);
  saveManifest(manifest);
  return trashItem;
}

/**
 * Lists items currently in the trash bin, filtered by user ownership if not admin.
 * @param {object} [user] Authenticated user object.
 * @returns {Array<object>}
 */
function listTrash(user = null) {
  const manifest = getManifest();
  if (!user || user.role === 'admin') {
    return manifest;
  }
  return manifest.filter(item => !item.owner || item.owner === user.username);
}

/**
 * Restores an item from the trash bin to its original location.
 * @param {string} id Trash item ID.
 * @param {object} [user] Authenticated user object.
 * @returns {object} Restored item metadata.
 */
function restoreFromTrash(id, user = null) {
  const manifest = getManifest();
  const index = manifest.findIndex(item => item.id === id);
  if (index === -1) {
    throw new Error('Item not found in Trash');
  }

  const item = manifest[index];
  if (user && user.role !== 'admin' && item.owner && item.owner !== user.username) {
    throw new Error('Access Denied: You do not have permission to restore this item');
  }

  if (!fs.existsSync(item.trashPath)) {
    manifest.splice(index, 1);
    saveManifest(manifest);
    throw new Error('File missing from Trash storage');
  }

  // Ensure parent target directory exists
  const parentDir = path.dirname(item.originalPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Move back
  fs.renameSync(item.trashPath, item.originalPath);

  // Remove from manifest
  manifest.splice(index, 1);
  saveManifest(manifest);
  return item;
}

/**
 * Purges trash items by ID or removes items older than 30 days.
 * @param {string|null} id Specific item ID to purge, or null to auto-purge expired items.
 * @param {object} [user] Authenticated user object.
 * @returns {{success: boolean}}
 */
function purgeTrash(id = null, user = null) {
  let manifest = getManifest();

  if (id) {
    const index = manifest.findIndex(item => item.id === id);
    if (index !== -1) {
      const item = manifest[index];
      if (user && user.role !== 'admin' && item.owner && item.owner !== user.username) {
        throw new Error('Access Denied: You do not have permission to purge this item');
      }
      if (fs.existsSync(item.trashPath)) {
        fs.rmSync(item.trashPath, { recursive: true, force: true });
      }
      manifest.splice(index, 1);
    }
  } else {
    // Purge items older than 30 days
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    manifest = manifest.filter(item => {
      const deletedTime = new Date(item.deletedAt).getTime();
      const shouldPurge = (now - deletedTime) > THIRTY_DAYS_MS;
      if (shouldPurge && fs.existsSync(item.trashPath)) {
        fs.rmSync(item.trashPath, { recursive: true, force: true });
        return false;
      }
      return true;
    });
  }

  saveManifest(manifest);
  return { success: true };
}

module.exports = {
  moveToTrash,
  listTrash,
  restoreFromTrash,
  purgeTrash
};
