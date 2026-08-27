const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Bonjour } = require('bonjour-service');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const rateLimit = require('express-rate-limit');

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

// Rate Limiter for Authentication Endpoints (10 requests per 15 mins per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

// Configure upload temp storage
const uploadTempDir = path.join(BASE_DIR, 'temp_uploads');
if (!fs.existsSync(uploadTempDir)) {
  fs.mkdirSync(uploadTempDir, { recursive: true });
}
const upload = multer({
  dest: uploadTempDir,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5 GB max upload size
});

// 1. Auto-generate .env on first run if it doesn't exist
const envPath = path.join(BASE_DIR, '.env');
if (!fs.existsSync(envPath)) {
  const secret = crypto.randomBytes(32).toString('hex');
  const passcode = Math.floor(100000 + Math.random() * 900000).toString();
  const passcodeHash = bcrypt.hashSync(passcode, 10);
  const envContent = `PORT=3000\nJWT_SECRET=${secret}\nPASSCODE_HASH=${passcodeHash}\nREQUIRE_EMAIL_VERIFICATION=true\n`;
  fs.writeFileSync(envPath, envContent);
}

require('dotenv').config({ path: envPath });

const { getDrives, getAvailableRaidDisks } = require('./driveService');
const { listFiles, validatePath, getMediaGallery, rescanMediaGallery, searchFiles, deleteFilesAndFolders } = require('./fileService');
const { streamFile } = require('./streamService');
const tunnelService = require('./tunnelService');
const { startTunnel, stopTunnel, getTunnelStatus, getNamedTunnelConfig, saveNamedTunnelConfig } = tunnelService;
const driveConfig = require('./driveConfigService');
const usersService = require('./usersService');
const dbService = require('./dbService');
const thumbnailService = require('./thumbnailService');
const trashService = require('./trashService');
const archiver = require('archiver');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Load or compute bcrypt hash for passcode authentication
let PASSCODE_HASH = process.env.PASSCODE_HASH;
if (!PASSCODE_HASH && process.env.PASSCODE) {
  PASSCODE_HASH = bcrypt.hashSync(process.env.PASSCODE.toString(), 10);
}

const SERVER_START_TIME = Date.now();

// In-memory activity log (synced with SQLite for persistence)
const activityLog = [];
function logActivity(type, detail, username = null) {
  const user = username || 'System';
  const entry = { type, detail, username: user, time: new Date().toISOString() };
  activityLog.unshift(entry);
  if (activityLog.length > 200) activityLog.pop();
  dbService.recordActivity(type, detail, user);
}

const helmet = require('helmet');

// Global Rate Limiter for API Endpoints (2000 req/min; skips media thumbnails & streaming)
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/thumbnail') || req.path.startsWith('/stream') || req.path.startsWith('/gallery'),
  message: { error: 'Rate limit exceeded. Please slow down requests.' }
});

// Enable Gzip/Brotli HTTP response compression for static assets and API payloads
app.use(compression());

// Serve the Windows Dashboard UI as static files with HTTP cache headers
app.use(helmet({
  contentSecurityPolicy: false, // Allows media streaming & blobs
  crossOriginResourcePolicy: false
}));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.ico') || filePath.endsWith('.svg')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin) return callback(null, true);

    const savedConfig = tunnelService.getNamedTunnelConfig();
    const customHost = savedConfig?.customUrl ? savedConfig.customUrl.replace(/^https?:\/\//, '') : '';

    // Allow localhost, LAN IPs, Cloudflare domains, and custom tunnel domains
    if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.)/)
        || origin.endsWith('.trycloudflare.com')
        || origin.endsWith('.cloudflare.com')
        || (customHost && origin.includes(customHost))) {
      return callback(null, true);
    }
    // Fallback: allow requests from valid client connections
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use('/api/', globalApiLimiter);

console.log('====================================');
console.log('  Personal NAS Server Status: Active');
console.log('  Dashboard: http://localhost:' + PORT);
console.log('====================================');

// 2. Authentication Middleware
const authenticateToken = (req, res, next) => {
  let token = req.headers['authorization']?.split(' ')[1];
  if (!token && req.query.token) token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentication token required' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    
    // Refresh user permissions from database if username present
    if (decoded.username && decoded.username !== 'Passcode Admin') {
      const dbUser = usersService.getUserByUsername(decoded.username);
      if (!dbUser) return res.status(403).json({ error: 'User account no longer exists' });
      if (dbUser.status === 'disabled') return res.status(403).json({ error: 'Your account has been disabled by an administrator.' });
      
      req.user = {
        ...decoded,
        id: dbUser.id,
        username: dbUser.username,
        role: dbUser.role || 'user',
        isReadonly: Boolean(dbUser.isReadonly),
        allowedDisks: dbUser.allowedDisks
      };
    } else if (decoded.username === 'Passcode Admin' || decoded.role === 'admin') {
      req.user = {
        role: 'admin',
        username: decoded.username || 'Passcode Admin',
        isReadonly: false,
        allowedDisks: null,
        ...decoded
      };
    } else {
      req.user = {
        role: 'user',
        username: decoded.username || 'user',
        isReadonly: Boolean(decoded.isReadonly),
        allowedDisks: decoded.allowedDisks || null,
        ...decoded
      };
    }
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrative privileges required.' });
  }
  next();
};

const checkReadWrite = (req, res, next) => {
  if (req.user?.isReadonly) {
    return res.status(403).json({ error: 'Read-Only Account: File modification, uploads, and deletions are disabled for your account.' });
  }
  next();
};

function isPathAllowed(targetPath, allowedDisks) {
  if (!allowedDisks || !Array.isArray(allowedDisks) || allowedDisks.length === 0) return true;
  if (!targetPath) return true;

  let cleanTarget = String(targetPath).replace(/::+/g, ':').trim().toUpperCase();
  if (/^[A-Z]:?$/.test(cleanTarget)) {
    cleanTarget = cleanTarget.replace(':', '') + ':\\';
  }
  cleanTarget = path.normalize(cleanTarget);
  if (!cleanTarget.endsWith('\\')) cleanTarget += '\\';

  return allowedDisks.some(disk => {
    let normDisk = String(disk).replace(/::+/g, ':').trim().toUpperCase();
    if (/^[A-Z]:?$/.test(normDisk)) {
      normDisk = normDisk.replace(':', '') + ':\\';
    }
    normDisk = path.normalize(normDisk);
    if (!normDisk.endsWith('\\')) normDisk += '\\';
    return cleanTarget.startsWith(normDisk);
  });
}

// ─── 3. AUTH ENDPOINTS ────────────────────────────────────────────────────────

app.get('/api/auth/status', (req, res) => {
  res.json({ 
    hasUsers: usersService.hasAnyUsers(),
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false'
  });
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (email && (!email.includes('@') || !email.includes('.'))) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  try {
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const result = await usersService.createUser({ username, email, password, baseUrl });
    logActivity('auth', 'New account created: ' + username, username);
    
    // Check if email verification is required and pending
    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== 'false';
    if (requireVerification && email && !result.user.emailVerified) {
      return res.json({ 
        message: 'Account created! Please check your email to verify your account before logging in.',
        requireEmailVerification: true,
        devLink: result.emailResult?.devLink
      });
    }

    const token = jwt.sign({
      authenticated: true,
      id: result.user.id,
      username: result.user.username,
      role: result.user.role,
      isReadonly: result.user.isReadonly,
      allowedDisks: result.user.allowedDisks
    }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, username: result.user.username, user: result.user });
  } catch (err) {
    if (err.code === 'USER_EXISTS') {
      return res.status(400).json({ error: 'Username or email is already taken' });
    }
    return res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { passcode, username, password } = req.body;
  
  if (passcode) {
    if (PASSCODE_HASH && bcrypt.compareSync(passcode.toString(), PASSCODE_HASH)) {
      const token = jwt.sign({ authenticated: true, role: 'admin', username: 'Passcode Admin' }, JWT_SECRET, { expiresIn: '7d' });
      logActivity('auth', 'Dashboard login via passcode', 'Passcode Admin');
      return res.json({ token, username: 'Passcode Admin', user: { username: 'Passcode Admin', role: 'admin', isReadonly: false, allowedDisks: null } });
    }
    return res.status(401).json({ error: 'Incorrect passcode' });
  }
  
  if (username && password) {
    const result = await usersService.verifyPassword(username, password);
    if (result.success) {
      const token = jwt.sign({
        authenticated: true,
        id: result.user.id,
        username: result.user.username,
        role: result.user.role || 'user',
        isReadonly: result.user.isReadonly,
        allowedDisks: result.user.allowedDisks
      }, JWT_SECRET, { expiresIn: '7d' });
      logActivity('auth', 'Dashboard login: ' + result.user.username, result.user.username);
      return res.json({ token, username: result.user.username, user: result.user });
    }

    if (result.reason === 'account_disabled') {
      return res.status(403).json({ error: result.message });
    }
    if (result.reason === 'account_locked') {
      return res.status(429).json({ error: result.message });
    }
    if (result.reason === 'email_not_verified') {
      return res.status(403).json({ 
        error: result.message, 
        requireEmailVerification: true
      });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.status(400).json({ error: 'Credentials required' });
});

app.get('/api/auth/verify-email', (req, res) => {
  const { token } = req.query;
  const result = usersService.verifyEmail(token);
  if (result.success) {
    logActivity('auth', `Email verified for user: ${result.username}`, result.username);
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Verified - Personal NAS</title>
        <style>
          body { background: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 40px; border-radius: 16px; text-align: center; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
          h1 { color: #00bcd4; margin-bottom: 16px; font-size: 24px; }
          p { color: #94a3b8; line-height: 1.6; font-size: 15px; }
          .btn { display: inline-block; margin-top: 24px; background: #00bcd4; color: #0f172a; padding: 12px 24px; border-radius: 10px; font-weight: bold; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ Email Verified!</h1>
          <p>Account <strong>${result.username}</strong> has been successfully verified.</p>
          <p>You can now log in using the Personal NAS Android App or Web Dashboard.</p>
          <a class="btn" href="/">Return to Dashboard</a>
        </div>
      </body>
      </html>
    `);
  }
  return res.status(400).send(`
    <!DOCTYPE html>
    <html>
    <head><title>Verification Failed - Personal NAS</title></head>
    <body style="background:#0f172a;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div style="background:#1e293b;padding:36px;border-radius:16px;text-align:center;max-width:400px;border:1px solid #334155;">
        <h2 style="color:#ef4444;margin-top:0;">❌ Verification Failed</h2>
        <p style="color:#94a3b8;line-height:1.5;">${result.message || 'Invalid or expired token'}</p>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, username: req.user?.username || 'Passcode Admin', user: req.user });
});

app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = usersService.getAllUsers();
    return res.json({ success: true, count: users.length, users });
  } catch (err) {
    return res.status(500).json({ error: `Failed to fetch users: ${err.message}` });
  }
});

// ─── 3.5. ADMIN MANAGEMENT ENDPOINTS ──────────────────────────────────────────

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = usersService.getAllUsers();
    res.json({ success: true, count: users.length, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const result = await usersService.createUser({ username, email, password, role });
    logActivity('admin', `Admin created user: ${username} (Role: ${result.user.role})`, req.user?.username);
    res.json({ success: true, user: result.user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id/permissions', authenticateToken, requireAdmin, (req, res) => {
  try {
    const updated = usersService.updateUserPermissions(req.params.id, req.body);
    logActivity('admin', `Updated permissions for user: ${updated.username} (Role: ${updated.role}, ReadOnly: ${updated.isReadonly}, Status: ${updated.status})`, req.user?.username);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    await usersService.resetUserPassword(req.params.id, newPassword);
    logActivity('admin', `Reset password for user ID: ${req.params.id}`, req.user?.username);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/unlock', authenticateToken, requireAdmin, (req, res) => {
  try {
    usersService.unlockUserAccount(req.params.id);
    logActivity('admin', `Unlocked account for user ID: ${req.params.id}`, req.user?.username);
    res.json({ success: true, message: 'Account unlocked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    usersService.deleteUser(req.params.id);
    logActivity('admin', `Deleted user account ID: ${req.params.id}`, req.user?.username);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/activity', authenticateToken, requireAdmin, (req, res) => {
  res.json(dbService.getActivityLogs({ username: req.user?.username, role: 'admin', limit: 200 }));
});

// ─── 4. SYSTEM ENDPOINT ────────────────────────────────────────────────────────

app.get('/api/system', authenticateToken, (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptime = `${hours}h ${minutes}m ${seconds}s`;

  // Get local IP addresses
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }

  res.json({
    uptime,
    nodeVersion: process.version,
    platform: os.platform(),
    hostname: os.hostname(),
    ipAddresses: ips,
    port: PORT
  });
});

// ─── 5. ACTIVITY LOG ──────────────────────────────────────────────────────────

app.get('/api/activity', authenticateToken, (req, res) => {
  const role = req.user?.role || 'user';
  const username = req.user?.username;

  if (role === 'admin') {
    return res.json(dbService.getActivityLogs({ username, role: 'admin', limit: 50 }));
  }

  if (!username) return res.json([]);
  const userLogs = dbService.getActivityLogs({ username, role: 'user', limit: 50 });
  res.json(userLogs);
});

// ─── 6. DRIVES ENDPOINTS ─────────────────────────────────────────────────────

// Get NAS-allowed drives (filtered by config and user permissions)
app.get('/api/drives', authenticateToken, async (req, res) => {
  try {
    const allDrives = await getDrives();
    const allowedPaths = driveConfig.getAllowedPaths();
    const customPaths = driveConfig.getCustomPaths();

    let drives;
    if (allowedPaths === null) {
      // First run: all auto-detected drives are allowed
      drives = allDrives;
    } else {
      // Filter auto-detected to only allowed
      drives = allDrives.filter(d =>
        allowedPaths.includes(d.letter) || allowedPaths.includes(d.letter + '\\') || allowedPaths.includes(d.letter + '/')
      );
      // Add custom paths (network shares, etc.)
      for (const cp of customPaths) {
        if (allowedPaths.includes(cp.path)) {
          drives.push({
            letter: cp.path,
            name: cp.label,
            size: 0,
            freeSpace: 0,
            type: 4,
            isUsb: false,
            isCustom: true
          });
        }
      }
    }

    // Apply user disk permission filter
    if (req.user?.allowedDisks && Array.isArray(req.user.allowedDisks) && req.user.allowedDisks.length > 0) {
      drives = drives.filter(d => isPathAllowed(d.letter, req.user.allowedDisks));
    }

    res.json(drives);
  } catch (err) {
    res.status(500).json({ error: `Failed to retrieve drives: ${err.message}` });
  }
});

// Get ALL available drives (for "Add Storage" modal)
app.get('/api/drives/available', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const allDrives = await getDrives();
    const allowedPaths = driveConfig.getAllowedPaths();

    const drivesWithStatus = allDrives.map(d => ({
      ...d,
      isRegistered: allowedPaths === null || allowedPaths.includes(d.letter) || allowedPaths.includes(d.letter + '\\')
    }));

    res.json(drivesWithStatus);
  } catch (err) {
    res.status(500).json({ error: `Failed to retrieve available drives: ${err.message}` });
  }
});

// Add a drive/path to the NAS
app.post('/api/drives/add', authenticateToken, requireAdmin, checkReadWrite, async (req, res) => {
  const { drivePath, label } = req.body;
  if (!drivePath) return res.status(400).json({ error: 'drivePath is required' });

  try {
    // If first action, initialize config with all current auto-detected drives
    const currentDrives = await getDrives();
    const currentLetters = currentDrives.map(d => d.letter);
    driveConfig.initializeWithDrives(currentLetters);

    driveConfig.addPath(drivePath, label || drivePath);
    logActivity('storage', `Added storage: ${drivePath}`, req.user?.username);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove a drive/path from the NAS
app.delete('/api/drives/remove', authenticateToken, requireAdmin, checkReadWrite, async (req, res) => {
  const { drivePath } = req.body;
  if (!drivePath) return res.status(400).json({ error: 'drivePath is required' });

  try {
    const currentDrives = await getDrives();
    const currentLetters = currentDrives.map(d => d.letter);
    driveConfig.initializeWithDrives(currentLetters);

    driveConfig.removePath(drivePath);
    logActivity('storage', `Removed storage: ${drivePath}`, req.user?.username);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── RAID STORAGE POOLING ENDPOINTS ──────────────────────────────────────────

// GET /api/disks/available - Returns unassigned physical/logical drives for RAID pooling
app.get('/api/disks/available', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const disks = await getAvailableRaidDisks();
    return res.json({
      success: true,
      disks
    });
  } catch (error) {
    console.error('Error querying available RAID disks:', error);
    return res.status(500).json({ success: false, error: 'Failed to query physical disks: ' + error.message });
  }
});

// GET /api/raid/volumes - Returns all registered RAID volumes
app.get('/api/raid/volumes', authenticateToken, async (req, res) => {
  try {
    const volumes = dbService.getAllVolumes();
    return res.json({ success: true, volumes });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve RAID volumes' });
  }
});

// Alias for /api/volumes
app.get('/api/volumes', authenticateToken, async (req, res) => {
  try {
    const volumes = dbService.getAllVolumes();
    return res.json({ success: true, volumes });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve volumes' });
  }
});

// POST /api/raid/create - Creates a RAID 1 Mirrored Array using two selected disks
app.post('/api/raid/create', authenticateToken, requireAdmin, checkReadWrite, async (req, res) => {
  try {
    const { arrayName, diskPaths, filesystem = 'ext4' } = req.body;

    // 1. Validation
    if (!arrayName || typeof arrayName !== 'string' || arrayName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'A valid array name is required (min 2 characters).' });
    }

    if (!Array.isArray(diskPaths) || diskPaths.length !== 2) {
      return res.status(400).json({ success: false, error: 'RAID 1 requires exactly two (2) physical member disks.' });
    }

    const [diskPath1, diskPath2] = diskPaths;
    const cleanArrayName = arrayName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    // Retrieve disk metadata to calculate mirrored usable capacity (min of both drives)
    const availableDisks = await getAvailableRaidDisks();
    const disk1 = availableDisks.find(d => d.path === diskPath1 || d.id === diskPath1) || { sizeBytes: 1000202039296, size: '931.5 GB' };
    const disk2 = availableDisks.find(d => d.path === diskPath2 || d.id === diskPath2) || { sizeBytes: 1000202039296, size: '931.5 GB' };
    
    const usableBytes = Math.min(disk1.sizeBytes || 1000202039296, disk2.sizeBytes || 1000202039296);
    const usableFormatted = disk1.size && disk2.size ? (disk1.sizeBytes <= disk2.sizeBytes ? disk1.size : disk2.size) : ((usableBytes / (1024 ** 3)).toFixed(1) + ' GB');
    const mdDevice = process.platform === 'win32' ? `\\\\.\\${cleanArrayName}` : '/dev/md0';
    const mountPoint = process.platform === 'win32' ? `R:\\${cleanArrayName}` : `/mnt/storage/${cleanArrayName}`;

    // --------------------------------------------------------------------------
    // 2. SYSTEM SHELL EXECUTION (mdadm / Storage Spaces RAID 1 Creation Placeholder)
    // --------------------------------------------------------------------------
    /*
      const { execSync } = require('child_process');

      // On Linux with mdadm:
      // STEP A: Zero superblocks on member drives
      // execSync(`mdadm --zero-superblock --force ${diskPath1} ${diskPath2}`);

      // STEP B: Create the RAID 1 array
      // execSync(`mdadm --create ${mdDevice} --level=1 --raid-devices=2 ${diskPath1} ${diskPath2} --metadata=1.2 --run`);

      // STEP C: Format filesystem (e.g. ext4 or btrfs)
      // execSync(`mkfs.${filesystem} -F ${mdDevice}`);

      // STEP D: Create mount point and mount volume
      // execSync(`mkdir -p ${mountPoint} && mount ${mdDevice} ${mountPoint}`);

      // STEP E: Save mdadm configuration
      // execSync(`mdadm --detail --scan >> /etc/mdadm/mdadm.conf && update-initramfs -u`);
    */

    // Simulate creation processing time
    await new Promise(resolve => setTimeout(resolve, 800));

    // 3. Persist Volume to SQLite Database
    const volumeRecord = dbService.createVolume({
      id: 'vol_' + crypto.randomBytes(6).toString('hex'),
      name: cleanArrayName,
      raidLevel: 1,
      memberDisks: [diskPath1, diskPath2],
      usableCapacityBytes: usableBytes,
      usableCapacityFormatted: usableFormatted,
      filesystem,
      mountPoint,
      devicePath: mdDevice
    });

    logActivity('storage', `Created RAID 1 Array: ${cleanArrayName} (${diskPath1}, ${diskPath2})`, req.user?.username);

    return res.status(201).json({
      success: true,
      message: `RAID 1 volume '${cleanArrayName}' created and registered successfully.`,
      volume: volumeRecord
    });
  } catch (error) {
    console.error('Error creating RAID 1 array:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to initialize RAID 1 array.'
    });
  }
});

// ─── 7. FILES ENDPOINTS ──────────────────────────────────────────────────────

app.get('/api/files', authenticateToken, async (req, res) => {
  const targetPath = req.query.path;

  try {
    if (!targetPath) {
      const drives = await getDrives();
      const allowedPaths = driveConfig.getAllowedPaths();
      const raidVolumes = dbService.getAllVolumes();

      let filteredDrives = drives;
      if (allowedPaths !== null) {
        filteredDrives = drives.filter(d =>
          allowedPaths.includes(d.letter) || allowedPaths.includes(d.letter + '\\')
        );
      }

      if (req.user?.allowedDisks && Array.isArray(req.user.allowedDisks) && req.user.allowedDisks.length > 0) {
        filteredDrives = filteredDrives.filter(d => isPathAllowed(d.letter, req.user.allowedDisks));
      }

      const raidDirectories = raidVolumes.map(v => ({
        name: `🛡️ ${v.name} (RAID 1 Mirror)`,
        path: `raid:${v.id}`,
        isDirectory: true,
        size: v.usable_capacity_bytes,
        freeSpace: v.usable_capacity_bytes,
        modifiedAt: new Date(v.created_at || Date.now()),
        ext: '',
        isDrive: true,
        isRaid: true
      }));

      const driveDirectories = filteredDrives.map(d => ({
        name: d.letter,
        path: d.letter + path.sep,
        isDirectory: true,
        size: d.size,
        freeSpace: d.freeSpace,
        modifiedAt: new Date(),
        ext: '',
        isDrive: true,
        isUsb: d.isUsb
      }));

      return res.json([...raidDirectories, ...driveDirectories]);
    }

    // Check if target is a RAID volume
    let raidVol = null;
    let raidSubfolder = '';
    const volumes = dbService.getAllVolumes();
    if (targetPath.startsWith('raid:')) {
      const parts = targetPath.replace(/^raid:/, '').split(/[\\\/]/).filter(Boolean);
      const volKey = parts[0] || '';
      raidSubfolder = parts.slice(1).join(path.sep);
      raidVol = volumes.find(v => v.id === volKey || v.name.toLowerCase() === volKey.toLowerCase());
    } else {
      raidVol = volumes.find(v => v.name.toLowerCase() === targetPath.toLowerCase() || (v.mount_point && v.mount_point.toUpperCase() === targetPath.toUpperCase()));
    }

    if (raidVol && Array.isArray(raidVol.member_disks) && raidVol.member_disks.length > 0) {
      const cleanPrimary = raidVol.member_disks[0].replace(/[\/\\]+$/, '');
      const raidDir = path.join(cleanPrimary + '\\', raidVol.name, raidSubfolder);
      await safeEnsureDir(raidDir);

      const files = await listFiles(raidDir);
      logActivity('browse', `Browsed RAID 1: ${raidVol.name}${raidSubfolder ? ' / ' + raidSubfolder : ''}`, req.user?.username);
      const results = files.map(f => ({ ...f, path: path.join(raidDir, f.name) }));
      return res.json(results);
    }

    // Clean double-colon or malformed drive path parameters (e.g. D::\ -> D:\)
    let cleanPath = targetPath.replace(/::+/g, ':').trim();
    if (/^[a-zA-Z]:?$/.test(cleanPath)) {
      cleanPath = cleanPath.replace(':', '') + ':\\';
    }
    const normalizedTargetPath = cleanPath;

    if (!isPathAllowed(normalizedTargetPath, req.user?.allowedDisks)) {
      return res.status(403).json({ error: 'Access Denied: You do not have permission to access this drive or folder.' });
    }

    const files = await listFiles(normalizedTargetPath);
    logActivity('browse', `Browsed: ${normalizedTargetPath}`, req.user?.username);
    const results = files.map(f => ({ ...f, path: path.join(normalizedTargetPath, f.name) }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: `Failed to list files: ${err.message}` });
  }
});

// ─── 7.1. DELETE FILES & FOLDERS ENDPOINT ────────────────────────────────────

app.post('/api/files/delete', authenticateToken, checkReadWrite, async (req, res) => {
  const { paths, path: singlePath } = req.body;
  const itemsToDelete = Array.isArray(paths) ? paths : (singlePath ? [singlePath] : []);

  if (itemsToDelete.length === 0) {
    return res.status(400).json({ error: 'No files or folders specified for deletion' });
  }

  // Check disk permissions
  for (const p of itemsToDelete) {
    if (!isPathAllowed(p, req.user?.allowedDisks)) {
      return res.status(403).json({ error: `Access Denied: You do not have permission to delete "${p}"` });
    }
  }

  try {
    const result = await deleteFilesAndFolders(itemsToDelete);
    const delCount = result.deleted.length;
    if (delCount > 0) {
      logActivity('delete', `Deleted ${delCount} item(s): ${result.deleted.slice(0, 3).map(p => path.basename(p)).join(', ')}${delCount > 3 ? '...' : ''}`, req.user?.username);
    }
    return res.json({
      success: true,
      deletedCount: delCount,
      deleted: result.deleted,
      failed: result.failed
    });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: `Failed to delete files: ${err.message}` });
  }
});

app.delete('/api/files', authenticateToken, checkReadWrite, async (req, res) => {
  const { paths, path: singlePath } = req.body || {};
  const queryPath = req.query.path;
  const itemsToDelete = Array.isArray(paths) ? paths : (singlePath ? [singlePath] : (queryPath ? [queryPath] : []));

  if (itemsToDelete.length === 0) {
    return res.status(400).json({ error: 'No files or folders specified for deletion' });
  }

  for (const p of itemsToDelete) {
    if (!isPathAllowed(p, req.user?.allowedDisks)) {
      return res.status(403).json({ error: `Access Denied: You do not have permission to delete "${p}"` });
    }
  }

  try {
    const result = await deleteFilesAndFolders(itemsToDelete);
    const delCount = result.deleted.length;
    if (delCount > 0) {
      logActivity('delete', `Deleted ${delCount} item(s): ${result.deleted.slice(0, 3).map(p => path.basename(p)).join(', ')}${delCount > 3 ? '...' : ''}`, req.user?.username);
    }
    return res.json({
      success: true,
      deletedCount: delCount,
      deleted: result.deleted,
      failed: result.failed
    });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: `Failed to delete files: ${err.message}` });
  }
});

// ─── 7.2. GLOBAL DISK SEARCH ENDPOINT ───────────────────────────────────────

app.get('/api/files/search', authenticateToken, async (req, res) => {
  const query = req.query.q;
  const targetDrive = req.query.drive;

  if (!query || !query.trim()) {
    return res.json([]);
  }

  if (targetDrive && !isPathAllowed(targetDrive, req.user?.allowedDisks)) {
    return res.status(403).json({ error: 'Access Denied: Unauthorized drive' });
  }

  try {
    let results = await searchFiles(query, targetDrive);
    if (req.user?.allowedDisks && Array.isArray(req.user.allowedDisks) && req.user.allowedDisks.length > 0) {
      results = results.filter(f => isPathAllowed(f.path, req.user.allowedDisks));
    }
    logActivity('search', `Global search for: "${query}" (${results.length} found)`, req.user?.username);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: `Failed to execute search: ${err.message}` });
  }
});

// ─── 7.5. GALLERY ENDPOINT ───────────────────────────────────────────────────

app.get('/api/gallery', authenticateToken, async (req, res) => {
  const targetDrive = req.query.drive;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  let limit = parseInt(req.query.limit, 10) || 500;
  if (req.query.limit === 'all' || limit > 500) {
    limit = 500;
  }
  limit = Math.max(1, limit);

  if (targetDrive && !isPathAllowed(targetDrive, req.user?.allowedDisks)) {
    return res.status(403).json({ error: 'Access Denied: Unauthorized drive' });
  }

  try {
    let allMedia = await getMediaGallery(targetDrive);
    if (req.user?.allowedDisks && Array.isArray(req.user.allowedDisks) && req.user.allowedDisks.length > 0) {
      allMedia = allMedia.filter(item => isPathAllowed(item.path, req.user.allowedDisks));
    }

    const totalItems = allMedia.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const startIndex = (page - 1) * limit;
    const paginatedMedia = allMedia.slice(startIndex, startIndex + limit);

    res.json({
      items: paginatedMedia,
      page,
      limit,
      totalItems,
      totalPages,
      hasMore: page < totalPages
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch gallery media: ${err.message}` });
  }
});

app.post('/api/gallery/rescan', authenticateToken, (req, res) => {
  rescanMediaGallery();
  res.json({ success: true, message: 'Media gallery background rescan started.' });
});

// ─── 8. STREAM ENDPOINT ──────────────────────────────────────────────────────

app.get('/api/stream', authenticateToken, async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) return res.status(400).json({ error: 'Path is required to stream' });

  if (!isPathAllowed(targetPath, req.user?.allowedDisks)) {
    return res.status(403).json({ error: 'Access Denied: Unauthorized drive or file path' });
  }

  try {
    await validatePath(targetPath);
    logActivity('stream', `Streamed: ${path.basename(targetPath)}`, req.user?.username);
    await streamFile(targetPath, req, res);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// ─── 9. UPLOAD & RAID 1 MIRRORING ENDPOINTS ─────────────────────────────────

async function safeEnsureDir(dirPath) {
  if (!dirPath) return;
  const normalized = path.normalize(dirPath).replace(/[\/\\]+$/, '');
  // Skip Windows drive roots (e.g. C:, I:, K:, C:\, I:\, K:\)
  if (/^[a-zA-Z]:?$/.test(normalized)) {
    return;
  }
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST' && err.code !== 'EPERM') {
      throw err;
    }
  }
}

app.post('/api/upload', authenticateToken, checkReadWrite, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const destinationDir = req.query.destination;
  if (!destinationDir) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    return res.status(400).json({ error: 'Destination path query is required' });
  }

  // Check if target is a RAID volume
  let raidVol = null;
  let raidSubfolder = '';
  const volumes = dbService.getAllVolumes();
  if (destinationDir.startsWith('raid:')) {
    const parts = destinationDir.replace(/^raid:/, '').split(/[\\\/]/).filter(Boolean);
    const volKey = parts[0] || '';
    raidSubfolder = parts.slice(1).join(path.sep);
    raidVol = volumes.find(v => v.id === volKey || v.name.toLowerCase() === volKey.toLowerCase());
  } else {
    raidVol = volumes.find(v => v.name.toLowerCase() === destinationDir.toLowerCase() || (v.mount_point && v.mount_point.toUpperCase() === destinationDir.toUpperCase()));
  }

  try {
    let relativePath = req.query.relativePath || req.headers['x-relative-path'] || '';
    let finalPath;

    if (raidVol && Array.isArray(raidVol.member_disks) && raidVol.member_disks.length > 0) {
      // ── RAID 1 MIRRORED UPLOAD ──
      // Write to primary member disk and automatically mirror to all other member disks
      const memberPaths = [];
      for (const disk of raidVol.member_disks) {
        const cleanDisk = disk.replace(/[\/\\]+$/, '');
        let targetDir = path.join(cleanDisk + '\\', raidVol.name, raidSubfolder);
        await safeEnsureDir(targetDir);

        let targetFile;
        if (relativePath) {
          const cleanRel = relativePath.replace(/\\/g, '/').split('/').filter(p => p !== '' && p !== '..').join(path.sep);
          targetFile = path.join(targetDir, cleanRel);
        } else {
          targetFile = path.join(targetDir, req.file.originalname);
        }
        await safeEnsureDir(path.dirname(targetFile));
        memberPaths.push(targetFile);
      }

      // Move uploaded file to primary member disk
      const primaryPath = memberPaths[0];
      try {
        await fs.promises.rename(req.file.path, primaryPath);
      } catch (renameErr) {
        if (renameErr.code === 'EXDEV') {
          await fs.promises.copyFile(req.file.path, primaryPath);
          await fs.promises.unlink(req.file.path);
        } else throw renameErr;
      }

      // Mirror file to all remaining member disks (e.g. Disk 2 / K:)
      for (let i = 1; i < memberPaths.length; i++) {
        try {
          await fs.promises.copyFile(primaryPath, memberPaths[i]);
        } catch (mirrorErr) {
          console.warn(`RAID 1 Mirror sync error on member disk ${raidVol.member_disks[i]}:`, mirrorErr.message);
        }
      }

      finalPath = primaryPath;
      logActivity('upload', `Uploaded to RAID 1 [${raidVol.name}]: ${relativePath || req.file.originalname}`, req.user?.username);
    } else {
      // ── STANDARD DISK UPLOAD ──
      if (!isPathAllowed(destinationDir, req.user?.allowedDisks)) {
        try { await fs.promises.unlink(req.file.path); } catch {}
        return res.status(403).json({ error: 'Access Denied: You do not have permission to upload to this drive or directory.' });
      }

      const validatedDir = await validatePath(destinationDir);
      await safeEnsureDir(validatedDir);

      if (relativePath) {
        const cleanRelPath = relativePath.replace(/\\/g, '/').split('/').filter(p => p !== '' && p !== '..').join(path.sep);
        finalPath = path.join(validatedDir, cleanRelPath);
      } else {
        finalPath = path.join(validatedDir, req.file.originalname);
      }

      await safeEnsureDir(path.dirname(finalPath));

      try {
        await fs.promises.rename(req.file.path, finalPath);
      } catch (renameErr) {
        if (renameErr.code === 'EXDEV') {
          await fs.promises.copyFile(req.file.path, finalPath);
          await fs.promises.unlink(req.file.path);
        } else throw renameErr;
      }

      logActivity('upload', `Uploaded: ${relativePath || req.file.originalname}`, req.user?.username);
    }

    res.json({ success: true, path: finalPath });
  } catch (err) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    res.status(500).json({ error: `File upload failed: ${err.message}` });
  }
});

// ─── 9.5. CHUNKED UPLOAD ENDPOINT ───────────────────────────────────────────

app.post('/api/upload/chunk', authenticateToken, checkReadWrite, upload.single('chunk'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No chunk file provided' });

  const fileId = req.headers['x-file-id'] || req.query.fileId;
  const chunkIndex = parseInt(req.headers['x-chunk-index'] || req.query.chunkIndex || '0', 10);
  const totalChunks = parseInt(req.headers['x-total-chunks'] || req.query.totalChunks || '1', 10);
  const originalName = req.headers['x-filename'] || req.query.filename || req.file.originalname;
  const destinationDir = req.query.destination;

  if (!fileId || !destinationDir) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    return res.status(400).json({ error: 'Missing fileId or destination parameter' });
  }

  // Check if destination is a RAID volume
  let raidVol = null;
  let raidSubfolder = '';
  const volumes = dbService.getAllVolumes();
  if (destinationDir.startsWith('raid:')) {
    const parts = destinationDir.replace(/^raid:/, '').split(/[\\\/]/).filter(Boolean);
    const volKey = parts[0] || '';
    raidSubfolder = parts.slice(1).join(path.sep);
    raidVol = volumes.find(v => v.id === volKey || v.name.toLowerCase() === volKey.toLowerCase());
  } else {
    raidVol = volumes.find(v => v.name.toLowerCase() === destinationDir.toLowerCase() || (v.mount_point && v.mount_point.toUpperCase() === destinationDir.toUpperCase()));
  }

  const chunkDir = path.join(__dirname, 'temp_uploads', 'chunks', fileId.replace(/[^a-zA-Z0-9_-]/g, ''));

  try {
    await safeEnsureDir(chunkDir);
    const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}`);
    await fs.promises.rename(req.file.path, chunkPath);

    // Check if all chunks have been received
    const files = await fs.promises.readdir(chunkDir);
    if (files.length >= totalChunks) {
      let finalPath;

      if (raidVol && Array.isArray(raidVol.member_disks) && raidVol.member_disks.length > 0) {
        const memberPaths = [];
        for (const disk of raidVol.member_disks) {
          const cleanDisk = disk.replace(/[\/\\]+$/, '');
          const targetDir = path.join(cleanDisk + '\\', raidVol.name, raidSubfolder);
          await safeEnsureDir(targetDir);
          memberPaths.push(path.join(targetDir, originalName));
        }

        const primaryPath = memberPaths[0];
        const writeStream = fs.createWriteStream(primaryPath);
        for (let i = 0; i < totalChunks; i++) {
          const partPath = path.join(chunkDir, `chunk_${i}`);
          if (fs.existsSync(partPath)) {
            const buffer = await fs.promises.readFile(partPath);
            writeStream.write(buffer);
            await fs.promises.unlink(partPath).catch(() => {});
          }
        }
        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          writeStream.end();
        });

        // Mirror chunked file to all secondary member disks
        for (let i = 1; i < memberPaths.length; i++) {
          try {
            await fs.promises.copyFile(primaryPath, memberPaths[i]);
          } catch (mErr) {
            console.warn(`RAID 1 Mirror chunk copy error:`, mErr.message);
          }
        }

        finalPath = primaryPath;
        logActivity('upload', `Uploaded (chunked) to RAID 1 [${raidVol.name}]: ${originalName}`, req.user?.username);
      } else {
        if (!isPathAllowed(destinationDir, req.user?.allowedDisks)) {
          return res.status(403).json({ error: 'Access Denied: You do not have permission to upload to this drive or directory.' });
        }

        const validatedDir = await validatePath(destinationDir);
        await safeEnsureDir(validatedDir);
        finalPath = path.join(validatedDir, originalName);

        const writeStream = fs.createWriteStream(finalPath);
        for (let i = 0; i < totalChunks; i++) {
          const partPath = path.join(chunkDir, `chunk_${i}`);
          if (fs.existsSync(partPath)) {
            const buffer = await fs.promises.readFile(partPath);
            writeStream.write(buffer);
            await fs.promises.unlink(partPath).catch(() => {});
          }
        }
        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          writeStream.end();
        });

        logActivity('upload', `Uploaded (chunked): ${originalName}`, req.user?.username);
      }

      // Clean up chunk directory
      await fs.promises.rmdir(chunkDir).catch(() => {});

      return res.json({ success: true, completed: true, path: finalPath });
    }

    res.json({ success: true, completed: false, chunkIndex, totalChunks });
  } catch (err) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    res.status(500).json({ error: `Chunk upload failed: ${err.message}` });
  }
});

// ─── 10. TUNNEL ENDPOINTS ─────────────────────────────────────────────────────

app.get('/api/tunnel/status', authenticateToken, (req, res) => res.json(getTunnelStatus()));

app.post('/api/tunnel/start', authenticateToken, async (req, res) => {
  try {
    const { mode, token, customUrl } = req.body || {};
    const savedConfig = getNamedTunnelConfig();
    
    const targetMode = mode || savedConfig.mode || 'quick';
    const targetToken = token || savedConfig.token || '';
    const targetCustomUrl = customUrl || savedConfig.customUrl || '';

    const url = await startTunnel(PORT, targetMode, targetToken, targetCustomUrl);
    logActivity('tunnel', `Tunnel (${targetMode}) activated: ${url}`, req.user?.username);
    res.json({ success: true, mode: targetMode, url });
  } catch (err) {
    res.status(500).json({ error: `Failed to start tunnel: ${err.message}` });
  }
});

app.post('/api/tunnel/configure-named', authenticateToken, async (req, res) => {
  try {
    const { token, customUrl } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: 'Cloudflare Zero Trust Tunnel Token is required' });
    }

    saveNamedTunnelConfig({ mode: 'named', token: token.trim(), customUrl: (customUrl || '').trim() });
    
    // Restart tunnel with new named configuration
    stopTunnel();
    const url = await startTunnel(PORT, 'named', token.trim(), (customUrl || '').trim());
    logActivity('tunnel', `Permanent Named Tunnel configured: ${url}`, req.user?.username);
    res.json({ success: true, mode: 'named', url });
  } catch (err) {
    res.status(500).json({ error: `Failed to configure named tunnel: ${err.message}` });
  }
});

app.post('/api/tunnel/stop', authenticateToken, (req, res) => {
  stopTunnel();
  logActivity('tunnel', 'Tunnel deactivated', req.user?.username);
  res.json({ success: true });
});

// ─── 10.5. SYSTEM CONTROL & MAINTENANCE ENDPOINTS ──────────────────────────────

app.post('/api/system/reboot', authenticateToken, requireAdmin, (req, res) => {
  logActivity('system', 'System reboot requested', req.user?.username);
  res.json({ success: true, message: 'System reboot request acknowledged.' });
});

app.post('/api/system/shutdown', authenticateToken, requireAdmin, (req, res) => {
  logActivity('system', 'System shutdown requested', req.user?.username);
  res.json({ success: true, message: 'System shutdown request acknowledged.' });
});

app.post('/api/system/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const files = await fs.promises.readdir(uploadTempDir);
    let count = 0;
    for (const f of files) {
      await fs.promises.unlink(path.join(uploadTempDir, f)).catch(() => {});
      count++;
    }
    logActivity('system', `Cleaned up ${count} temporary files`, req.user?.username);
    res.json({ success: true, filesCleaned: count });
  } catch (err) {
    res.status(500).json({ error: `Cleanup failed: ${err.message}` });
  }
});

app.post('/api/drives/refresh', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const drives = await getDrives();
    logActivity('storage', `Refreshed drive list (${drives.length} drives detected)`, req.user?.username);
    res.json({ success: true, count: drives.length, drives });
  } catch (err) {
    res.status(500).json({ error: `Drive refresh failed: ${err.message}` });
  }
});

// ─── 10.8. THUMBNAIL, TRASH & BATCH FILES ENDPOINTS ────────────────────────────

app.get('/api/thumbnail', authenticateToken, async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) return res.status(400).json({ error: 'Path is required' });
  if (!isPathAllowed(targetPath, req.user?.allowedDisks)) {
    return res.status(403).json({ error: 'Access Denied: Unauthorized file path' });
  }
  try {
    const thumbPath = await thumbnailService.getOrGenerateThumbnail(targetPath, 250);
    res.sendFile(thumbPath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trash', authenticateToken, (req, res) => {
  res.json(trashService.listTrash());
});

app.post('/api/trash/restore', authenticateToken, checkReadWrite, (req, res) => {
  try {
    const item = trashService.restoreFromTrash(req.body.id);
    logActivity('trash', `Restored: ${item.fileName}`, req.user?.username);
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/trash/purge', authenticateToken, checkReadWrite, (req, res) => {
  try {
    trashService.purgeTrash(req.query.id);
    logActivity('trash', 'Purged trash item', req.user?.username);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 7.3. RENAME FILE OR FOLDER ENDPOINT ────────────────────────────────────

app.post('/api/files/rename', authenticateToken, checkReadWrite, async (req, res) => {
  const { oldPath, newName } = req.body || {};
  if (!oldPath || !newName) {
    return res.status(400).json({ error: 'oldPath and newName are required' });
  }

  // Sanitize newName (prevent path traversal characters)
  const cleanNewName = path.basename(newName.trim());
  if (!cleanNewName || cleanNewName.includes('..') || cleanNewName.includes('/') || cleanNewName.includes('\\')) {
    return res.status(400).json({ error: 'Invalid name provided' });
  }

  if (!isPathAllowed(oldPath, req.user?.allowedDisks)) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to rename items on this drive.' });
  }

  try {
    const allVolumes = dbService.getAllVolumes();
    let normOld = path.normalize(oldPath.trim()).replace(/[\/\\]+$/, '');
    let finalPath = '';

    // Check if target is inside a RAID volume
    let foundRaid = false;
    for (const vol of allVolumes) {
      if (!Array.isArray(vol.member_disks) || vol.member_disks.length === 0) continue;
      for (const disk of vol.member_disks) {
        const cleanDisk = disk.replace(/[\/\\]+$/, '');
        const volRoot = path.join(cleanDisk + '\\', vol.name);
        if (normOld.toLowerCase() === volRoot.toLowerCase() || normOld.toLowerCase().startsWith(volRoot.toLowerCase() + '\\')) {
          foundRaid = true;
          const relWithinVol = normOld.slice(volRoot.length).replace(/^[\\\/]+/, '');
          const parentRel = path.dirname(relWithinVol) === '.' ? '' : path.dirname(relWithinVol);

          // Rename across all member disks
          for (let i = 0; i < vol.member_disks.length; i++) {
            const d = vol.member_disks[i].replace(/[\/\\]+$/, '');
            const memberOld = path.join(d + '\\', vol.name, relWithinVol);
            const memberNew = path.join(d + '\\', vol.name, parentRel, cleanNewName);
            if (fs.existsSync(memberOld)) {
              await fs.promises.rename(memberOld, memberNew);
            }
            if (i === 0) finalPath = memberNew;
          }
          break;
        }
      }
      if (foundRaid) break;
    }

    if (!foundRaid) {
      const validatedOld = await validatePath(oldPath);
      const parentDir = path.dirname(validatedOld);
      const validatedNew = path.join(parentDir, cleanNewName);
      await fs.promises.rename(validatedOld, validatedNew);
      finalPath = validatedNew;
    }

    logActivity('files', `Renamed "${path.basename(oldPath)}" to "${cleanNewName}"`, req.user?.username);
    res.json({ success: true, oldPath, newPath: finalPath, name: cleanNewName });
  } catch (err) {
    console.error('Rename error:', err);
    res.status(500).json({ error: `Failed to rename item: ${err.message}` });
  }
});

// ─── 7.4. CREATE NEW FOLDER ENDPOINT ─────────────────────────────────────────

app.post('/api/files/mkdir', authenticateToken, checkReadWrite, async (req, res) => {
  const { path: targetPath } = req.body || {};
  if (!targetPath) return res.status(400).json({ error: 'Path is required' });

  if (!isPathAllowed(targetPath, req.user?.allowedDisks)) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to create folders on this drive.' });
  }

  try {
    const allVolumes = dbService.getAllVolumes();
    let normTarget = path.normalize(targetPath.trim());
    let finalPath = normTarget;

    // Check if target is inside a RAID volume
    let foundRaid = false;
    for (const vol of allVolumes) {
      if (!Array.isArray(vol.member_disks) || vol.member_disks.length === 0) continue;
      for (const disk of vol.member_disks) {
        const cleanDisk = disk.replace(/[\/\\]+$/, '');
        const volRoot = path.join(cleanDisk + '\\', vol.name);
        if (normTarget.toLowerCase() === volRoot.toLowerCase() || normTarget.toLowerCase().startsWith(volRoot.toLowerCase() + '\\')) {
          foundRaid = true;
          const relWithinVol = normTarget.slice(volRoot.length).replace(/^[\\\/]+/, '');

          // Create across all member disks
          for (let i = 0; i < vol.member_disks.length; i++) {
            const d = vol.member_disks[i].replace(/[\/\\]+$/, '');
            const memberDir = path.join(d + '\\', vol.name, relWithinVol);
            await safeEnsureDir(memberDir);
            if (i === 0) finalPath = memberDir;
          }
          break;
        }
      }
      if (foundRaid) break;
    }

    if (!foundRaid) {
      const validatedDir = await validatePath(targetPath);
      await safeEnsureDir(validatedDir);
      finalPath = validatedDir;
    }

    logActivity('files', `Created folder: ${path.basename(finalPath)}`, req.user?.username);
    res.json({ success: true, created: true, path: finalPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 10.9. SYNC SETTINGS & TARGET VALIDATION ────────────────────────────────

// Get persistent user sync settings from SQLite
app.get('/api/sync/settings', authenticateToken, (req, res) => {
  try {
    const userId = req.user?.id || req.user?.username || 'default_user';
    const settings = dbService.getSyncSettings(userId);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save persistent user sync settings to SQLite
app.post('/api/sync/settings', authenticateToken, (req, res) => {
  try {
    const userId = req.user?.id || req.user?.username || 'default_user';
    const saved = dbService.saveSyncSettings(userId, req.body || {});
    logActivity('sync', `Updated auto-sync settings for ${userId}`, req.user?.username);
    res.json({ success: true, settings: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate target directory availability, write permissions, and available disk space
app.post('/api/sync/validate-target', authenticateToken, async (req, res) => {
  const { destination, requiredBytes } = req.body || {};
  if (!destination) return res.status(400).json({ error: 'destination is required' });

  try {
    const validatedDir = await validatePath(destination);
    const fsSync = require('fs');
    if (!fsSync.existsSync(validatedDir)) {
      await fs.promises.mkdir(validatedDir, { recursive: true });
    }

    // Test write permission
    const testFile = path.join(validatedDir, `.write_test_${Date.now()}.tmp`);
    await fs.promises.writeFile(testFile, 'test');
    await fs.promises.unlink(testFile);

    // Get disk space info
    const drives = await getDrives();
    const driveLetter = validatedDir.substring(0, 2).toUpperCase();
    const matchedDrive = drives.find(d => d.letter.toUpperCase().startsWith(driveLetter));

    const freeBytes = matchedDrive ? matchedDrive.free : null;
    const isSpaceSufficient = (freeBytes !== null && requiredBytes) ? freeBytes >= requiredBytes : true;

    res.json({
      valid: true,
      writable: true,
      path: validatedDir,
      drive: matchedDrive ? matchedDrive.letter : driveLetter,
      freeBytes,
      requiredBytes: requiredBytes || 0,
      sufficientSpace: isSpaceSufficient
    });
  } catch (err) {
    res.status(400).json({ valid: false, error: err.message });
  }
});

// Returns a list of filenames+sizes already in a target folder (for mobile dedup)
app.get('/api/sync/manifest', authenticateToken, async (req, res) => {
  const folder = req.query.folder;
  if (!folder) return res.status(400).json({ error: 'folder query parameter is required' });

  try {
    const validatedPath = await validatePath(folder);
    const fsSync = require('fs');
    if (!fsSync.existsSync(validatedPath)) {
      return res.json({ files: [] });
    }
    const entries = await fs.promises.readdir(validatedPath, { withFileTypes: true });
    const manifest = [];
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          const stats = await fs.promises.stat(path.join(validatedPath, entry.name));
          manifest.push({
            name: entry.name,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString()
          });
        } catch (e) {}
      }
    }
    res.json({ files: manifest, folder: validatedPath });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// Chunked upload endpoint — receives file chunks and assembles them
app.post('/api/upload/chunk', authenticateToken, upload.single('chunk'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No chunk data' });

  const { fileName, chunkIndex, totalChunks, destination } = req.body;
  if (!fileName || chunkIndex === undefined || !totalChunks || !destination) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    return res.status(400).json({ error: 'fileName, chunkIndex, totalChunks, and destination are required' });
  }

  try {
    const validatedDir = await validatePath(destination);
    const chunksDir = path.join(uploadTempDir, `chunks_${Buffer.from(fileName).toString('hex')}`);
    await fs.promises.mkdir(chunksDir, { recursive: true });

    // Move chunk to chunks staging area
    const chunkPath = path.join(chunksDir, `chunk_${String(chunkIndex).padStart(6, '0')}`);
    await fs.promises.rename(req.file.path, chunkPath);

    const idx = parseInt(chunkIndex);
    const total = parseInt(totalChunks);

    // Check if all chunks received
    const existingChunks = await fs.promises.readdir(chunksDir);
    if (existingChunks.length >= total) {
      // Assemble final file
      await fs.promises.mkdir(validatedDir, { recursive: true });
      const finalPath = path.join(validatedDir, fileName);
      const writeStream = require('fs').createWriteStream(finalPath);

      for (let i = 0; i < total; i++) {
        const cp = path.join(chunksDir, `chunk_${String(i).padStart(6, '0')}`);
        const chunkData = await fs.promises.readFile(cp);
        writeStream.write(chunkData);
      }
      writeStream.end();

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Cleanup chunks
      for (const f of existingChunks) {
        await fs.promises.unlink(path.join(chunksDir, f)).catch(() => {});
      }
      await fs.promises.rmdir(chunksDir).catch(() => {});

      logActivity('upload', `Chunked upload complete: ${fileName}`, req.user?.username);
      return res.json({ success: true, complete: true, path: finalPath });
    }

    res.json({ success: true, complete: false, chunksReceived: existingChunks.length, totalChunks: total });
  } catch (err) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// ─── 11. API 404 & GLOBAL JSON ERROR HANDLERS ───────────────────────────────
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack || err.message || err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'An unexpected server error occurred.'
  });
});

// ─── 12. SPA FALLBACK ─────────────────────────────────────────────────────────
// Serve index.html for any non-API route (needed for SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── 12. START SERVER ─────────────────────────────────────────────────────────

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);

  try {
    const bonjour = new Bonjour({}, (err) => {
      console.warn('mDNS network warning:', err?.message || err);
    });
    const service = bonjour.publish({
      name: 'Personal NAS Server',
      type: 'personal-nas',
      port: parseInt(PORT),
      txt: { version: '1.0.0' }
    });
    service.on('up', () => console.log('mDNS published: _personal-nas._tcp.local'));
    service.on('error', err => console.warn('mDNS status:', err?.message || err));
  } catch (err) {
    console.warn('Failed to initialize mDNS:', err.message);
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err.stack || err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason?.stack || reason?.message || reason);
});

process.on('SIGINT', () => { console.log('\nShutting down...'); stopTunnel(); process.exit(0); });
process.on('SIGTERM', () => { stopTunnel(); process.exit(0); });
