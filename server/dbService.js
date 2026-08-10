const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'nas_data.db');
const db = new Database(DB_PATH);

// Enable WAL mode for high performance & ACID safety
db.pragma('journal_mode = WAL');

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0,
    failed_attempts INTEGER DEFAULT 0,
    lock_until INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification_tokens (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_settings (
    user_id TEXT PRIMARY KEY,
    target_drive TEXT,
    target_folder_path TEXT,
    folder_structure TEXT DEFAULT 'flat',
    media_type TEXT DEFAULT 'both',
    wifi_only INTEGER DEFAULT 1,
    charging_only INTEGER DEFAULT 0,
    low_battery_pause INTEGER DEFAULT 1,
    updated_at TEXT NOT NULL
  );
`);

// Auto-migrate legacy users.json if exists
const legacyFile = path.join(__dirname, 'users.json');
if (fs.existsSync(legacyFile)) {
  try {
    const raw = fs.readFileSync(legacyFile, 'utf8');
    const legacyUsers = JSON.parse(raw || '[]');
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO users (id, username, email, password_hash, email_verified, failed_attempts, lock_until, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const u of legacyUsers) {
      insertStmt.run(
        u.id || Math.random().toString(36).substring(2),
        u.username,
        u.email || null,
        u.passwordHash || u.password || '',
        u.emailVerified ? 1 : 0,
        u.failedAttempts || 0,
        u.lockUntil || 0,
        u.createdAt || new Date().toISOString()
      );
    }
    console.log(`✅ Migrated ${legacyUsers.length} user(s) from users.json to SQLite nas_data.db`);
  } catch (err) {
    console.warn('Legacy migration notice:', err.message);
  }
}

/**
 * Internal helper to format database user row to domain object.
 * @param {object} row Raw database row from SQLite users table.
 * @returns {object|null} Formatted user object.
 */
function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    emailVerified: Boolean(row.email_verified),
    failedAttempts: row.failed_attempts,
    lockUntil: row.lock_until,
    createdAt: row.created_at
  };
}

/**
 * Checks if any users exist in the database.
 * @returns {boolean}
 */
function hasAnyUsers() {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return row.count > 0;
}

/**
 * Retrieves a user record by case-insensitive username.
 * @param {string} username
 * @returns {object|null}
 */
function getUserByUsername(username) {
  const row = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  return mapUserRow(row);
}

/**
 * Retrieves a user record by case-insensitive email.
 * @param {string} email
 * @returns {object|null}
 */
function getUserByEmail(email) {
  if (!email) return null;
  const row = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  return mapUserRow(row);
}

async function createUser({ username, email, password }) {
  if (getUserByUsername(username) || getUserByEmail(email)) {
    const err = new Error('Username or email is already taken');
    err.code = 'USER_EXISTS';
    throw err;
  }

  const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const passwordHash = await bcrypt.hash(password, 10);
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, email_verified, failed_attempts, lock_until, created_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?)
  `).run(id, username, email || null, passwordHash, email ? 0 : 1, createdAt);

  const user = getUserByUsername(username);

  let emailResult = null;
  if (email) {
    const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    db.prepare('INSERT INTO verification_tokens (token, username, expires_at) VALUES (?, ?, ?)').run(token, username, expiresAt);
    emailResult = { success: true, token };
  }

  return { user, emailResult };
}

async function verifyPassword(username, password) {
  const user = getUserByUsername(username);
  if (!user) return { success: false, reason: 'user_not_found' };

  const now = Date.now();
  if (user.lockUntil && user.lockUntil > now) {
    const minutesLeft = Math.ceil((user.lockUntil - now) / 60000);
    return {
      success: false,
      reason: 'account_locked',
      message: `Account is locked due to multiple failed login attempts. Please try again in ${minutesLeft} minute(s).`
    };
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (isMatch) {
    db.prepare('UPDATE users SET failed_attempts = 0, lock_until = 0 WHERE id = ?').run(user.id);

    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== 'false';
    if (requireVerification && user.email && !user.emailVerified) {
      return {
        success: false,
        reason: 'email_not_verified',
        message: 'Please verify your email address before logging in.',
        user
      };
    }

    return { success: true, user };
  }

  // Failed login attempt
  const attempts = (user.failedAttempts || 0) + 1;
  let lockUntil = 0;
  if (attempts >= 5) {
    lockUntil = now + 15 * 60 * 1000;
  }

  db.prepare('UPDATE users SET failed_attempts = ?, lock_until = ? WHERE id = ?').run(attempts, lockUntil, user.id);

  if (attempts >= 5) {
    return {
      success: false,
      reason: 'account_locked',
      message: 'Too many failed login attempts. Account locked for 15 minutes.'
    };
  }

  return { success: false, reason: 'invalid_password', attemptsLeft: 5 - attempts };
}

function verifyEmail(token) {
  const row = db.prepare('SELECT * FROM verification_tokens WHERE token = ?').get(token);
  if (!row || row.expires_at < Date.now()) {
    return { success: false, message: 'Invalid or expired verification token.' };
  }

  db.prepare('UPDATE users SET email_verified = 1 WHERE LOWER(username) = LOWER(?)').run(row.username);
  db.prepare('DELETE FROM verification_tokens WHERE token = ?').run(token);

  return { success: true, username: row.username };
}

function getAllUsers() {
  const rows = db.prepare('SELECT id, username, email, email_verified, failed_attempts, created_at FROM users ORDER BY created_at DESC').all();
  return rows.map(r => ({
    id: r.id,
    username: r.username,
    email: r.email,
    emailVerified: Boolean(r.email_verified),
    failedAttempts: r.failed_attempts,
    createdAt: r.created_at
  }));
}

function getSyncSettings(userId) {
  const row = db.prepare('SELECT * FROM sync_settings WHERE user_id = ?').get(userId || 'default_user');
  if (!row) {
    return {
      userId: userId || 'default_user',
      targetDrive: '',
      targetFolderPath: 'Mobile Backups\\Photos',
      folderStructure: 'flat',
      mediaType: 'both',
      wifiOnly: true,
      chargingOnly: false,
      lowBatteryPause: true,
      updatedAt: new Date().toISOString()
    };
  }
  return {
    userId: row.user_id,
    targetDrive: row.target_drive || '',
    targetFolderPath: row.target_folder_path || 'Mobile Backups\\Photos',
    folderStructure: row.folder_structure || 'flat',
    mediaType: row.media_type || 'both',
    wifiOnly: Boolean(row.wifi_only),
    chargingOnly: Boolean(row.charging_only),
    lowBatteryPause: Boolean(row.low_battery_pause),
    updatedAt: row.updated_at
  };
}

function saveSyncSettings(userId, settings) {
  const uId = userId || 'default_user';
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO sync_settings (user_id, target_drive, target_folder_path, folder_structure, media_type, wifi_only, charging_only, low_battery_pause, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      target_drive = excluded.target_drive,
      target_folder_path = excluded.target_folder_path,
      folder_structure = excluded.folder_structure,
      media_type = excluded.media_type,
      wifi_only = excluded.wifi_only,
      charging_only = excluded.charging_only,
      low_battery_pause = excluded.low_battery_pause,
      updated_at = excluded.updated_at
  `).run(
    uId,
    settings.targetDrive || '',
    settings.targetFolderPath || 'Mobile Backups\\Photos',
    settings.folderStructure || 'flat',
    settings.mediaType || 'both',
    settings.wifiOnly !== false ? 1 : 0,
    settings.chargingOnly ? 1 : 0,
    settings.lowBatteryPause !== false ? 1 : 0,
    updatedAt
  );
  return getSyncSettings(uId);
}

module.exports = {
  hasAnyUsers,
  getUserByUsername,
  getUserByEmail,
  createUser,
  verifyPassword,
  verifyEmail,
  getAllUsers,
  getSyncSettings,
  saveSyncSettings
};
