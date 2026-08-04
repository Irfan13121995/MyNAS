const fs = require('fs');
const path = require('path');

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'drives_config.json');

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
  if (config.allowedPaths.includes(normalized)) {
    throw new Error(`"${normalized}" is already registered.`);
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

module.exports = {
  getAllowedPaths,
  getCustomPaths,
  addPath,
  removePath,
  initializeWithDrives,
};
