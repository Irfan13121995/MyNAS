const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.NAS_DATA_DIR || (process.pkg ? path.dirname(process.execPath) : __dirname);
const CONFIG_PATH = path.join(DATA_DIR, 'drives_config.json');

/**
 * Reads configuration from drives_config.json.
 * @returns {{allowedPaths: Array<string>|null, customPaths: Array<object>}}
 */
function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    // First run: no config — null means "allow all auto-detected drives"
    return { allowedPaths: null, customPaths: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { allowedPaths: null, customPaths: [] };
  }
}

/**
 * Persists updated configuration object to drives_config.json.
 * @param {object} config
 */
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Returns the list of allowed drive letters/paths.
 * null means "all auto-detected drives are allowed" (first-run default).
 */
function getAllowedPaths() {
  return readConfig().allowedPaths;
}

/**
 * Returns custom user-added paths (network shares, specific folders).
 */
function getCustomPaths() {
  return readConfig().customPaths || [];
}

/**
 * Adds a drive letter or custom path to the allowed list.
 * @param {string} drivePath - e.g. "E:" or "\\\\server\\share"
 * @param {string} label - friendly name
 */
function addPath(drivePath, label) {
  const config = readConfig();

  // Initialize allowedPaths from auto-detected if this is the first explicit action
  // (caller should pass currentDriveLetters for initialization)
  if (!config.allowedPaths) {
    config.allowedPaths = [];
  }

  const normalized = drivePath.trim().replace(/[/\\]+$/, '');

  // Check if already present
  const normUpper = normalized.toUpperCase();
  if (config.allowedPaths.some(p => p.toUpperCase() === normUpper)) {
    return; // Already registered, idempotent
  }

  config.allowedPaths.push(normalized);

  // Track custom paths (non-standard drive letters) separately for display
  const isCustom = !/^[A-Za-z]:$/.test(normalized);
  if (isCustom) {
    if (!config.customPaths) config.customPaths = [];
    const exists = config.customPaths.find(p => p.path === normalized);
    if (!exists) {
      config.customPaths.push({ path: normalized, label: label || normalized, addedAt: new Date().toISOString() });
    }
  }

  saveConfig(config);
}

/**
 * Removes a drive letter or custom path from the allowed list.
 * @param {string} drivePath
 */
function removePath(drivePath) {
  const config = readConfig();
  if (!config.allowedPaths) return; // Nothing to remove from "allow all"

  const normalized = drivePath.trim().replace(/[/\\]+$/, '');
  config.allowedPaths = config.allowedPaths.filter(p => p !== normalized);

  // Also remove from customPaths if present
  if (config.customPaths) {
    config.customPaths = config.customPaths.filter(p => p.path !== normalized);
  }

  saveConfig(config);
}

/**
 * Initializes the allowed list explicitly with a set of drive letters.
 * Called on first "Add" or "Remove" action to lock in the current set.
 */
function initializeWithDrives(driveLetters) {
  const config = readConfig();
  if (config.allowedPaths === null) {
    config.allowedPaths = driveLetters.map(l => l.trim().replace(/[/\\]+$/, ''));
    if (!config.customPaths) config.customPaths = [];
    saveConfig(config);
  }
}

/**
 * Explicitly replaces or configures the entire allowed storage paths list.
 * @param {Array<string>} paths
 * @param {Array<object>} customPaths
 */
function setAllowedPaths(paths, customPaths = []) {
  const config = {
    allowedPaths: Array.isArray(paths) ? paths.map(p => p.trim().replace(/[/\\]+$/, '')) : null,
    customPaths: Array.isArray(customPaths) ? customPaths : []
  };
  saveConfig(config);
  return config;
}

/**
 * Synchronizes allowedPaths with required paths (e.g. RAID member disks) and currently connected drives.
 * - Ensures all requiredPaths (e.g. member disks ["I:", "K:"]) are present in allowedPaths.
 * - Purges stale drive letters that are not connected, not in requiredPaths, and not custom paths.
 * @param {Array<string>} requiredPaths - e.g. ["I:", "K:"]
 * @param {Array<string>} currentValidDriveLetters - e.g. ["C:", "I:", "K:"]
 * @returns {Array<string>|null}
 */
function syncWithDisks(requiredPaths = [], currentValidDriveLetters = []) {
  const config = readConfig();
  const normalizedRequired = (requiredPaths || []).map(p => p.trim().replace(/[\/\\]+$/, '').toUpperCase());
  const normalizedCurrent = (currentValidDriveLetters || []).map(p => p.trim().replace(/[\/\\]+$/, '').toUpperCase());

  if (!config.allowedPaths) {
    const initial = normalizedCurrent.filter(d => !d.startsWith('C:'));
    for (let i = 0; i < normalizedRequired.length; i++) {
      const req = (requiredPaths[i] || '').trim().replace(/[\/\\]+$/, '');
      if (!initial.some(x => x.toUpperCase() === normalizedRequired[i])) {
        initial.push(req);
      }
    }
    config.allowedPaths = initial;
  } else {
    const existingUpper = config.allowedPaths.map(p => p.toUpperCase().replace(/[\/\\]+$/, ''));

    for (let i = 0; i < normalizedRequired.length; i++) {
      const reqUpper = normalizedRequired[i];
      if (!existingUpper.includes(reqUpper)) {
        config.allowedPaths.push((requiredPaths[i] || '').trim().replace(/[\/\\]+$/, ''));
        existingUpper.push(reqUpper);
      }
    }

    if (normalizedCurrent.length > 0) {
      const customPathStrings = (config.customPaths || []).map(cp => cp.path.toUpperCase().replace(/[\/\\]+$/, ''));
      config.allowedPaths = config.allowedPaths.filter(p => {
        const pClean = p.trim().replace(/[\/\\]+$/, '');
        const pUpper = pClean.toUpperCase();
        // If it's a custom path or UNC network share (not a standard single drive letter like "D:"), keep it
        if (!/^[A-Z]:$/i.test(pClean)) return true;
        if (normalizedCurrent.includes(pUpper)) return true;
        if (normalizedRequired.includes(pUpper)) return true;
        if (customPathStrings.includes(pUpper)) return true;
        return false;
      });
    }
  }

  saveConfig(config);
  return config.allowedPaths;
}

module.exports = {
  getAllowedPaths,
  getCustomPaths,
  addPath,
  removePath,
  initializeWithDrives,
  setAllowedPaths,
  syncWithDisks
};
