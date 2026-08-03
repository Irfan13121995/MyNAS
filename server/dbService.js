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

function hasAnyUsers() {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return row.count > 0;
}

function getUserByUsername(username) {
  const row = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
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

function getUserByEmail(email) {
  if (!email) return null;
  const row = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
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

function verifyPassword(username, password) {
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

  const isMatch = bcrypt.compareSync(password, user.passwordHash);
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

module.exports = {
  hasAnyUsers,
  getUserByUsername,
  getUserByEmail,
  createUser,
  verifyPassword,
  verifyEmail,
  getAllUsers
};
