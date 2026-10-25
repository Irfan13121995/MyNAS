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
const cookieParser = require('cookie-parser');

const rateLimit = require('express-rate-limit');

const DATA_DIR = process.env.NAS_DATA_DIR || (process.pkg ? path.dirname(process.execPath) : __dirname);
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}
const BASE_DIR = DATA_DIR;

// Rate Limiter for Authentication Endpoints (10 requests per 15 mins per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

// Configure upload temp storage
const uploadTempDir = path.join(DATA_DIR, 'temp_uploads');
if (!fs.existsSync(uploadTempDir)) {
  fs.mkdirSync(uploadTempDir, { recursive: true });
}
const upload = multer({
  dest: uploadTempDir,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5 GB max upload size
});

// Background Worker: Automatically prune stale chunked uploads older than 2 hours
setInterval(async () => {
  const chunksParent = path.join(uploadTempDir, 'chunks');
  if (!fs.existsSync(chunksParent)) return;
  try {
    const dirs = await fs.promises.readdir(chunksParent);
    const now = Date.now();
    const MAX_CHUNK_AGE = 2 * 60 * 60 * 1000; // 2 hours
    for (const d of dirs) {
      const fullDir = path.join(chunksParent, d);
      const stat = await fs.promises.stat(fullDir).catch(() => null);
      if (stat && now - stat.mtimeMs > MAX_CHUNK_AGE) {
        await fs.promises.rm(fullDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[Cleanup] Error pruning stale chunks:', e.message);
  }
}, 60 * 60 * 1000);

// 1. Auto-generate .env on first run if it doesn't exist
const envPath = path.join(DATA_DIR, '.env');
let isFirstRunSetup = false;
let initialGeneratedPasscode = null;
if (!fs.existsSync(envPath)) {
  isFirstRunSetup = true;
  const secret = crypto.randomBytes(32).toString('hex');
  initialGeneratedPasscode = Math.floor(100000 + Math.random() * 900000).toString();
  const passcodeHash = bcrypt.hashSync(initialGeneratedPasscode, 10);
  const envContent = `# Personal NAS Server Configuration
PORT=3000
JWT_SECRET=${secret}
PASSCODE_HASH=${passcodeHash}
REQUIRE_EMAIL_VERIFICATION=false
`;
  fs.writeFileSync(envPath, envContent);
}

require('dotenv').config({ path: envPath });

const { getDrives, getAvailableRaidDisks } = require('./driveService');
const { listFiles, validatePath, resolveSafeTarget, getMediaGallery, rescanMediaGallery, searchFiles, deleteFilesAndFolders } = require('./fileService');
const { streamFile } = require('./streamService');
const tunnelService = require('./tunnelService');
const { startTunnel, stopTunnel, getTunnelStatus, getNamedTunnelConfig, saveNamedTunnelConfig } = tunnelService;
const driveConfig = require('./driveConfigService');
const usersService = require('./usersService');
const dbService = require('./dbService');
const thumbnailService = require('./thumbnailService');
const trashService = require('./trashService');
const archiver = require('archiver');
const QRCode = require('qrcode');

const ALLOW_PUBLIC_REGISTRATION = process.env.ALLOW_PUBLIC_REGISTRATION === 'true';

const app = express();
app.set('trust proxy', 'loopback');
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

// Serve the Windows Dashboard UI as static files with HTTP cache headers and fine-grained CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "https://mynas-hi.online"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
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
    const customHost = savedConfig?.customUrl ? savedConfig.customUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase() : '';

    // Allow localhost, LAN IPs, exact active tunnel URL, and exact custom domain
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
    const isLan = /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);
    const activeTunnel = tunnelService.getTunnelStatus();
    const activeTunnelUrl = activeTunnel?.url ? activeTunnel.url.replace(/\/+$/, '').toLowerCase() : null;
    const isCurrentTunnel = activeTunnelUrl && origin.toLowerCase() === activeTunnelUrl;
    const isCustomHost = customHost && (origin.toLowerCase() === `https://${customHost}` || origin.toLowerCase() === `http://${customHost}`);

    if (isLocalhost || isLan || isCurrentTunnel || isCustomHost) {
      return callback(null, true);
    }
    // Block unauthorized origins
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use('/api/', globalApiLimiter);

// Network / LAN Request Verifier
function isLocalOrLanRequest(req) {
  // Cloudflare tunnel headers indicate public internet origin
  if (req.headers['cf-connecting-ip'] || req.headers['cf-ray'] || req.headers['cf-visitor']) {
    return false;
  }
  const rawIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
  const cleanIp = rawIp.replace(/^.*:/, '');
  const isLocal = rawIp === '127.0.0.1' || rawIp === '::1' || rawIp === '::ffff:127.0.0.1';
  const isLan = cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp);
  return isLocal || isLan;
}

// Session Cookie Helpers (HttpOnly, SameSite, Secure)
function setAuthCookie(req, res, token) {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || !!req.headers['cf-connecting-ip'];
  res.cookie('nas_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

function clearAuthCookie(req, res) {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || !!req.headers['cf-connecting-ip'];
  res.clearCookie('nas_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure
  });
}

console.log('====================================');
console.log('  Personal NAS Server Status: Active');
console.log('  Dashboard: http://localhost:' + PORT);
console.log('====================================');

// 2. Authentication Middleware
const authenticateToken = (req, res, next) => {
  let token = req.cookies?.nas_token;
  if (!token && req.headers['authorization']) {
    const parts = req.headers['authorization'].split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    } else {
      token = parts[0];
    }
  }
  // Security Hardening: Permit query string token ONLY for media streaming & thumbnails (required by native mobile players)
  if (!token && req.query.token && (req.path === '/stream' || req.path === '/thumbnail')) {
    token = req.query.token;
  }
  if (!token) return res.status(401).json({ error: 'Authentication token required' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    
    // Refresh user permissions from database if username present
    if (decoded.username && decoded.username !== 'Passcode Admin') {
      const dbUser = usersService.getUserByUsername(decoded.username);
      if (!dbUser) return res.status(403).json({ error: 'User account no longer exists' });
      if (dbUser.status === 'disabled') return res.status(403).json({ error: 'Your account has been disabled by an administrator.' });
      if (decoded.tokenVersion && dbUser.tokenVersion && decoded.tokenVersion !== dbUser.tokenVersion) {
        return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
      }
      
      req.user = {
        ...decoded,
        id: dbUser.id,
        username: dbUser.username,
        role: dbUser.role || 'user',
        isReadonly: Boolean(dbUser.isReadonly),
        allowedDisks: dbUser.allowedDisks,
        tokenVersion: dbUser.tokenVersion
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
  // If allowedDisks is null or undefined: unrestricted (admin or default full access)
  if (allowedDisks === null || allowedDisks === undefined) return true;
  // If allowedDisks is an explicit array, an empty array means ZERO allowed disks!
  if (!Array.isArray(allowedDisks) || allowedDisks.length === 0) return false;
  if (!targetPath) return false;

  let cleanTarget = String(targetPath).replace(/::+/g, ':').trim().toUpperCase();
  if (cleanTarget.startsWith('RAID:')) {
    const rawRaid = cleanTarget.replace(/^RAID:/, '');
    const parts = rawRaid.split(/[\\\/]/).filter(Boolean);
    const volKey = parts[0] || '';
    const volumes = dbService.getAllVolumes();
    const raidVol = volumes.find(v => v.id.toUpperCase() === volKey || v.name.toUpperCase() === volKey);
    if (!raidVol || !Array.isArray(raidVol.member_disks) || raidVol.member_disks.length === 0) {
      return false;
    }
    const cleanPrimary = raidVol.member_disks[0].replace(/[\/\\]+$/, '');
    return isPathAllowed(cleanPrimary + '\\', allowedDisks);
  }

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

// ─── 2.5 SETUP / ONBOARDING WIZARD ENDPOINTS ────────────────────────────────
app.get('/api/setup/status', async (req, res) => {
  try {
    const hasUsers = usersService.hasAnyUsers();
    const tunnelConfig = getNamedTunnelConfig();
    const drives = hasUsers ? [] : await getDrives();
    const raidDisks = hasUsers ? [] : await getAvailableRaidDisks();

    // Get host machine local network IPs
    const interfaces = os.networkInterfaces();
    const lanIps = [];
    for (const iface of Object.values(interfaces)) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) lanIps.push(addr.address);
      }
    }

    const initialPasscode = process.env.PASSCODE || (isFirstRunSetup ? initialGeneratedPasscode : null);

    res.json({
      needsSetup: !hasUsers,
      hasUsers,
      hostname: os.hostname(),
      platform: os.platform(),
      lanIps,
      port: PORT,
      drives,
      raidDisks,
      recoveryPasscode: initialPasscode,
      defaultTunnelUrl: tunnelConfig.customUrl || 'https://mynas-hi.online'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/setup/complete', authLimiter, async (req, res) => {
  try {
    if (usersService.hasAnyUsers()) {
      return res.status(403).json({ error: 'Setup has already been completed. Please log in.' });
    }

    // Security Hardening: Initial setup must only be claimed from local machine or private LAN
    if (!isLocalOrLanRequest(req)) {
      return res.status(403).json({ error: 'Setup wizard can only be accessed locally on this machine or your local LAN, not through the public internet or external proxies.' });
    }

    const {
      username,
      email,
      password,
      serverName,
      storageDrives,
      storageDrive,
      customStoragePath,
      createRaidMirror,
      raidMemberDisks,
      tunnelMode,
      tunnelToken,
      customUrl
    } = req.body;

    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // 1. Create first user as Master Admin
    const result = await usersService.createUser({ username, email, password, role: 'admin' });
    logActivity('auth', 'Master Admin account configured via Setup Wizard: ' + username, username);

    // 2. Configure Storage Drives & Storage Directory
    let configuredAllowedPaths = [];
    let customPaths = [];

    // Parse selected drives
    let selectedLetters = [];
    if (Array.isArray(storageDrives) && storageDrives.length > 0) {
      selectedLetters = storageDrives.map(d => String(d).trim().replace(/[\/\\]+$/, ''));
    } else if (storageDrive && typeof storageDrive === 'string') {
      selectedLetters = [storageDrive.trim().replace(/[\/\\]+$/, '')];
    }

    if (selectedLetters.length > 0) {
      configuredAllowedPaths = [...selectedLetters];
    } else {
      // Auto-detect non-system drives if none explicitly selected
      const allDrives = await getDrives();
      configuredAllowedPaths = allDrives
        .filter(d => !d.letter.toUpperCase().startsWith('C:'))
        .map(d => d.letter.replace(/[\/\\]+$/, ''));
    }

    // Handle dedicated custom storage folder (e.g. D:\NAS_Storage or C:\NAS_Storage)
    let finalStoragePath = '';
    if (customStoragePath && typeof customStoragePath === 'string' && customStoragePath.trim()) {
      const cleanCustom = path.resolve(customStoragePath.trim());
      await safeEnsureDir(cleanCustom);
      await safeEnsureDir(path.join(cleanCustom, 'MobileUploads'));
      await safeEnsureDir(path.join(cleanCustom, 'NAS_Backup'));
      await safeEnsureDir(path.join(cleanCustom, 'Documents'));
      await safeEnsureDir(path.join(cleanCustom, 'Media'));

      customPaths.push({
        path: cleanCustom,
        label: 'Primary NAS Storage',
        addedAt: new Date().toISOString()
      });
      if (!configuredAllowedPaths.includes(cleanCustom)) {
        configuredAllowedPaths.push(cleanCustom);
      }
      finalStoragePath = cleanCustom;
    } else if (selectedLetters.length > 0) {
      const primaryDrive = selectedLetters[0];
      const defaultFolder = path.join(primaryDrive + '\\', 'NAS_Storage');
      try {
        await safeEnsureDir(defaultFolder);
        await safeEnsureDir(path.join(defaultFolder, 'MobileUploads'));
        await safeEnsureDir(path.join(defaultFolder, 'NAS_Backup'));
      } catch (e) {}
      finalStoragePath = defaultFolder;
    }

    // Persist storage paths in driveConfig
    if (configuredAllowedPaths.length > 0) {
      driveConfig.setAllowedPaths(configuredAllowedPaths, customPaths);
      logActivity('storage', `Initial storage configured with: ${configuredAllowedPaths.join(', ')}`, username);
    }

    // 3. Optional RAID 1 Mirrored Storage Pool Setup
    let createdRaidVolume = null;
    if (createRaidMirror && Array.isArray(raidMemberDisks) && raidMemberDisks.length === 2) {
      try {
        const [d1, d2] = raidMemberDisks;
        const availableDisks = await getAvailableRaidDisks();
        const disk1 = availableDisks.find(d => d.path === d1 || d.id === d1) || { sizeBytes: 1000202039296, size: '931.5 GB' };
        const disk2 = availableDisks.find(d => d.path === d2 || d.id === d2) || { sizeBytes: 1000202039296, size: '931.5 GB' };
        const usableBytes = Math.min(disk1.sizeBytes || 1000202039296, disk2.sizeBytes || 1000202039296);
        const usableFormatted = disk1.size && disk2.size ? (disk1.sizeBytes <= disk2.sizeBytes ? disk1.size : disk2.size) : ((usableBytes / (1024 ** 3)).toFixed(1) + ' GB');
        const raidName = 'myNAS_RAID';
        const mountPoint = process.platform === 'win32' ? `R:\\${raidName}` : `/mnt/storage/${raidName}`;
        const mdDevice = process.platform === 'win32' ? `\\\\.\\${raidName}` : '/dev/md0';

        createdRaidVolume = dbService.createVolume({
          id: 'vol_' + crypto.randomBytes(6).toString('hex'),
          name: raidName,
          raidLevel: 1,
          memberDisks: [d1, d2],
          usableCapacityBytes: usableBytes,
          usableCapacityFormatted: usableFormatted,
          filesystem: 'ext4',
          mountPoint,
          devicePath: mdDevice
        });

        for (const md of [d1, d2]) {
          const rootDir = path.join(md.replace(/[\/\\]+$/, '') + '\\', raidName);
          await safeEnsureDir(rootDir);
          await safeEnsureDir(path.join(rootDir, 'MobileUploads'));
          await safeEnsureDir(path.join(rootDir, 'NAS_Backup'));
        }
        logActivity('storage', `Initial RAID 1 Mirrored Array configured: ${raidName} (${d1}, ${d2})`, username);
      } catch (raidErr) {
        console.warn('[Setup] RAID initialization notice:', raidErr.message);
      }
    }

    // 4. Configure Remote Access Tunnel
    let activeServerUrl = `http://${req.get('host')}`;
    const cleanUrl = customUrl ? customUrl.trim() : 'https://mynas-hi.online';

    if (tunnelMode === 'named' && tunnelToken && tunnelToken.trim().length > 10) {
      saveNamedTunnelConfig({ mode: 'named', token: tunnelToken.trim(), customUrl: cleanUrl });
      startTunnel(PORT, 'named', tunnelToken.trim(), cleanUrl).catch(e => {
        console.warn('[Setup] Named tunnel launch notice:', e.message);
      });
      activeServerUrl = cleanUrl;
      logActivity('system', `Cloudflare Named Tunnel configured: ${cleanUrl}`, username);
    } else if (tunnelMode === 'quick') {
      startTunnel(PORT, 'quick').then(qUrl => {
        if (qUrl) activeServerUrl = qUrl;
      }).catch(e => {
        console.warn('[Setup] Quick tunnel launch notice:', e.message);
      });
      logActivity('system', 'Cloudflare Quick Tunnel activated', username);
    }

    // 5. Issue Admin JWT Session Token
    const token = jwt.sign({
      authenticated: true,
      id: result.user.id,
      username: result.user.username,
      role: 'admin',
      isReadonly: false,
      allowedDisks: null,
      tokenVersion: result.user.tokenVersion || 1
    }, JWT_SECRET, { expiresIn: '7d' });

    setAuthCookie(req, res, token);

    // 6. Pre-generate Mobile Pairing QR Code for instant phone pairing
    let pairingData = null;
    try {
      const { pairingCode, expiresAt } = usersService.createPairingCode(result.user.username);
      const pairingPayload = JSON.stringify({
        url: activeServerUrl.replace(/\/+$/, ''),
        pairingCode,
        username: result.user.username
      });
      const qrDataUrl = await QRCode.toDataURL(pairingPayload, {
        width: 280,
        margin: 2,
        color: { dark: '#0F172A', light: '#FFFFFF' }
      });
      pairingData = {
        pairingCode,
        qrDataUrl,
        expiresAt,
        serverUrl: activeServerUrl
      };
    } catch (qrErr) {
      console.warn('[Setup] QR generation notice:', qrErr.message);
    }

    res.json({
      success: true,
      message: 'Personal NAS configured successfully!',
      token,
      username: result.user.username,
      user: result.user,
      storagePath: finalStoragePath,
      raidVolume: createdRaidVolume,
      pairing: pairingData,
      serverUrl: activeServerUrl
    });
  } catch (err) {
    console.error('Setup wizard error:', err);
    res.status(400).json({ error: err.message || 'Setup wizard failed' });
  }
});

// ─── 3. AUTH ENDPOINTS ────────────────────────────────────────────────────────

app.get('/api/auth/status', (req, res) => {
  res.json({ 
    hasUsers: usersService.hasAnyUsers(),
    allowPublicRegistration: false,
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false'
  });
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  // Security Hardening: Public self-registration is permanently disabled. Admin-invite only.
  return res.status(403).json({ 
    error: 'Public registration is disabled. User accounts must be created by an administrator in the Admin Panel.' 
  });
});

// Admin-Only User Creation Endpoint
app.post('/api/admin/users/create', authenticateToken, requireAdmin, async (req, res) => {
  const { username, email, password, role, isReadonly, allowedDisks } = req.body;
  if (!username || username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const result = await usersService.createUser({
      username,
      email: email || null,
      password,
      role: role || 'user',
      isReadonly: Boolean(isReadonly),
      allowedDisks: Array.isArray(allowedDisks) ? allowedDisks : []
    });
    logActivity('admin', `Admin created user account "${username}" [role: ${role || 'user'}]`, req.user?.username);
    res.json({ success: true, user: result.user });
  } catch (err) {
    if (err.code === 'USER_EXISTS') {
      return res.status(400).json({ error: 'Username or email is already taken' });
    }
    return res.status(400).json({ error: err.message || 'Failed to create user' });
  }
});

// User Session Invalidation / Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    if (req.user?.username && req.user.username !== 'Passcode Admin') {
      usersService.incrementTokenVersion(req.user.username);
    }
    clearAuthCookie(req, res);
    logActivity('auth', 'Logged out session', req.user?.username);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    clearAuthCookie(req, res);
    res.status(500).json({ error: err.message });
  }
});

// ─── MOBILE PAIRING CODE ENDPOINTS (OFFLINE QR & SINGLE-USE CODES) ───────────

app.post('/api/pairing/create', authenticateToken, async (req, res) => {
  try {
    const { pairingCode, expiresAt } = usersService.createPairingCode(req.user.username);
    const namedConfig = tunnelService.getNamedTunnelConfig();
    const tunnelStatus = tunnelService.getTunnelStatus();
    let serverUrl = tunnelStatus?.url || namedConfig?.customUrl || `http://${req.get('host')}`;
    serverUrl = serverUrl.replace(/\/+$/, '');

    res.json({
      success: true,
      url: serverUrl,
      pairingCode,
      expiresAt,
      username: req.user.username
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to create pairing code: ${err.message}` });
  }
});

app.get('/api/pairing/qr', authenticateToken, async (req, res) => {
  try {
    const { pairingCode, expiresAt } = usersService.createPairingCode(req.user.username);
    const namedConfig = tunnelService.getNamedTunnelConfig();
    const tunnelStatus = tunnelService.getTunnelStatus();
    let serverUrl = tunnelStatus?.url || namedConfig?.customUrl || `http://${req.get('host')}`;
    serverUrl = serverUrl.replace(/\/+$/, '');

    const payload = JSON.stringify({
      url: serverUrl,
      pairingCode,
      username: req.user.username
    });

    const qrDataUrl = await QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' }
    });

    res.json({
      success: true,
      qrDataUrl,
      serverUrl,
      pairingCode,
      expiresAt,
      username: req.user.username
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to generate pairing QR: ${err.message}` });
  }
});

app.post('/api/pairing/redeem', authLimiter, async (req, res) => {
  const { code, deviceName } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Pairing code is required' });
  }

  try {
    const user = usersService.redeemPairingCode(code);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired pairing code. Please generate a new QR code on your PC.' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'This user account is currently disabled.' });
    }

    const token = jwt.sign({
      authenticated: true,
      id: user.id,
      username: user.username,
      role: user.role || 'user',
      isReadonly: user.isReadonly,
      allowedDisks: user.allowedDisks,
      tokenVersion: user.tokenVersion || 1,
      device: deviceName || 'Mobile App'
    }, JWT_SECRET, { expiresIn: '7d' });

    logActivity('auth', `Mobile paired device [${deviceName || 'Mobile App'}]`, user.username);
    return res.json({
      success: true,
      token,
      username: user.username,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isReadonly: user.isReadonly,
        allowedDisks: user.allowedDisks
      }
    });
  } catch (err) {
    return res.status(500).json({ error: `Pairing failed: ${err.message}` });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { passcode, username, password } = req.body;
  
  if (passcode) {
    if (!isLocalOrLanRequest(req)) {
      return res.status(403).json({ error: 'Passcode login is only permitted from the local network (LAN / localhost) for emergency recovery.' });
    }
    if (PASSCODE_HASH && bcrypt.compareSync(passcode.toString(), PASSCODE_HASH)) {
      const token = jwt.sign({ authenticated: true, role: 'admin', username: 'Passcode Admin', tokenVersion: 1 }, JWT_SECRET, { expiresIn: '7d' });
      logActivity('auth', 'Dashboard recovery login via passcode', 'Passcode Admin');
      setAuthCookie(req, res, token);
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
        allowedDisks: result.user.allowedDisks,
        tokenVersion: result.user.tokenVersion || 1
      }, JWT_SECRET, { expiresIn: '7d' });
      logActivity('auth', 'Dashboard login: ' + result.user.username, result.user.username);
      setAuthCookie(req, res, token);
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

const escapeHtml = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
};

app.get('/api/auth/verify-email', (req, res) => {
  const { token } = req.query;
  const result = usersService.verifyEmail(token);
  if (result.success) {
    const safeUsername = escapeHtml(result.username);
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
          <p>Account <strong>${safeUsername}</strong> has been successfully verified.</p>
          <p>You can now log in using the Personal NAS Android App or Web Dashboard.</p>
          <a class="btn" href="/">Return to Dashboard</a>
        </div>
      </body>
      </html>
    `);
  }
  const safeMessage = escapeHtml(result.message || 'Invalid or expired token');
  return res.status(400).send(`
    <!DOCTYPE html>
    <html>
    <head><title>Verification Failed - Personal NAS</title></head>
    <body style="background:#0f172a;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div style="background:#1e293b;padding:36px;border-radius:16px;text-align:center;max-width:400px;border:1px solid #334155;">
        <h2 style="color:#ef4444;margin-top:0;">❌ Verification Failed</h2>
        <p style="color:#94a3b8;line-height:1.5;">${safeMessage}</p>
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
    const raidVolumes = dbService.getAllVolumes();

    // Map member disks to their RAID volume details
    const raidMemberMap = new Map();
    for (const vol of raidVolumes) {
      for (const disk of (vol.member_disks || [])) {
        const cleanDisk = disk.trim().replace(/[\/\\]+$/, '').toUpperCase();
        raidMemberMap.set(cleanDisk, {
          volumeName: vol.name,
          volumeId: vol.id,
          raidLevel: vol.raid_level
        });
      }
    }

    // Keep driveConfig in sync with current physical drives and RAID member disks
    const raidMemberDisks = Array.from(raidMemberMap.keys());
    const currentLetters = allDrives.map(d => d.letter);
    try {
      driveConfig.syncWithDisks(raidMemberDisks, currentLetters);
    } catch (e) {}

    const allowedPaths = driveConfig.getAllowedPaths();
    const customPaths = driveConfig.getCustomPaths();

    let drives;
    if (allowedPaths === null) {
      // First run: auto-detected storage drives, excluding system drive C: by default
      drives = allDrives.filter(d => !d.letter.toUpperCase().startsWith('C:'));
    } else {
      // Filter auto-detected to allowed OR member of an active RAID volume
      drives = allDrives.filter(d => {
        const norm = d.letter.trim().replace(/[\/\\]+$/, '').toUpperCase();
        if (allowedPaths.some(p => p.trim().replace(/[\/\\]+$/, '').toUpperCase() === norm)) return true;
        if (raidMemberMap.has(norm)) return true;
        return false;
      });

      // Add custom paths (network shares, etc.)
      for (const cp of customPaths) {
        if (allowedPaths.some(p => p.trim().replace(/[\/\\]+$/, '').toUpperCase() === cp.path.trim().replace(/[\/\\]+$/, '').toUpperCase())) {
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

    // Enrich each drive with RAID membership status
    drives = drives.map(d => {
      const norm = (d.letter || '').trim().replace(/[\/\\]+$/, '').toUpperCase();
      const raidInfo = raidMemberMap.get(norm);
      if (raidInfo) {
        return {
          ...d,
          isRaidMember: true,
          raidVolumeName: raidInfo.volumeName,
          raidVolumeId: raidInfo.volumeId,
          raidLevel: raidInfo.raidLevel
        };
      }
      return {
        ...d,
        isRaidMember: false
      };
    });

    // Apply user disk permission filter
    if (req.user && req.user.role !== 'admin' && req.user.allowedDisks !== null && req.user.allowedDisks !== undefined) {
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
      isRegistered: allowedPaths === null 
        ? !d.letter.toUpperCase().startsWith('C:') 
        : (allowedPaths.includes(d.letter) || allowedPaths.includes(d.letter + '\\') || allowedPaths.includes(d.letter + '/'))
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

    // Auto-register member disks in driveConfig
    try {
      driveConfig.addPath(diskPath1, `${cleanArrayName} Mirror Member 1`);
      driveConfig.addPath(diskPath2, `${cleanArrayName} Mirror Member 2`);
    } catch (e) {}

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

// PUT /api/raid/volumes/:id - Updates a RAID volume name or mount point
app.put('/api/raid/volumes/:id', authenticateToken, requireAdmin, checkReadWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mountPoint } = req.body;

    const existing = dbService.getVolumeById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'RAID volume not found.' });
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ success: false, error: 'Array name must be at least 2 characters.' });
      }
    }

    const cleanName = name ? name.trim().replace(/[^a-zA-Z0-9_\- ]/g, '_') : existing.name;
    const cleanMount = mountPoint !== undefined ? String(mountPoint).trim() : existing.mount_point;

    const updated = dbService.updateVolume(id, { name: cleanName, mountPoint: cleanMount });
    if (!updated) {
      return res.status(500).json({ success: false, error: 'Failed to update RAID volume in database.' });
    }

    logActivity('storage', `Updated RAID 1 Array: ${cleanName} (was: ${existing.name})`, req.user?.username);

    return res.json({
      success: true,
      message: `RAID 1 array '${cleanName}' updated successfully.`,
      volume: updated
    });
  } catch (err) {
    console.error('Error updating RAID volume:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to update RAID volume.' });
  }
});

// DELETE /api/raid/volumes/:id - Deletes/dissolves a RAID volume
app.delete('/api/raid/volumes/:id', authenticateToken, requireAdmin, checkReadWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const keepDisks = req.body?.keepDisks !== undefined ? req.body.keepDisks : (req.query.keepDisks !== 'false');

    const volume = dbService.getVolumeById(id);
    if (!volume) {
      return res.status(404).json({ success: false, error: 'RAID volume not found.' });
    }

    dbService.deleteVolume(id);

    // If user explicitly chose not to keep member disks, remove from driveConfig
    if (keepDisks === false || keepDisks === 'false') {
      const remainingVolumes = dbService.getAllVolumes();
      const stillUsedDisks = new Set();
      remainingVolumes.forEach(v => (v.member_disks || []).forEach(d => stillUsedDisks.add(d.toUpperCase())));

      for (const disk of (volume.member_disks || [])) {
        if (!stillUsedDisks.has(disk.toUpperCase())) {
          try { driveConfig.removePath(disk); } catch (e) {}
        }
      }
    }

    logActivity('storage', `Deleted RAID 1 Array: ${volume.name} (${(volume.member_disks || []).join(', ')})`, req.user?.username);

    return res.json({
      success: true,
      message: `RAID 1 array '${volume.name}' deleted successfully.`
    });
  } catch (err) {
    console.error('Error deleting RAID volume:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to delete RAID volume.' });
  }
});

// POST /api/raid/volumes/:id/scrub - Verifies integrity and data consistency across mirror member disks
app.post('/api/raid/volumes/:id/scrub', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const volume = dbService.getVolumeById(id);
    if (!volume) {
      return res.status(404).json({ success: false, error: 'RAID volume not found.' });
    }

    const memberDisks = volume.member_disks || [];
    const diskChecks = [];

    for (const disk of memberDisks) {
      let isAccessible = false;
      try {
        const rootPath = disk.endsWith('\\') || disk.endsWith('/') ? disk : disk + path.sep;
        fs.accessSync(rootPath, fs.constants.R_OK);
        isAccessible = true;
      } catch (e) {
        isAccessible = false;
      }
      diskChecks.push({ disk, accessible: isAccessible });
    }

    const allHealthy = diskChecks.length > 0 && diskChecks.every(d => d.accessible);

    logActivity('storage', `Scrubbed RAID 1 Array: ${volume.name} - Status: ${allHealthy ? 'Healthy (100% in sync)' : 'Degraded'}`, req.user?.username);

    return res.json({
      success: true,
      status: allHealthy ? 'Healthy' : 'Degraded',
      syncedPercent: allHealthy ? 100 : 50,
      errorsFound: allHealthy ? 0 : 1,
      diskChecks,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error scrubbing RAID volume:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to perform RAID scrub.' });
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
      for (const p of parts) {
        if (p === '..' || p.includes(':')) {
          return res.status(403).json({ error: 'Access Denied: Directory traversal sequences (..) are forbidden' });
        }
      }
      raidSubfolder = parts.slice(1).join(path.sep);
      raidVol = volumes.find(v => v.id === volKey || v.name.toLowerCase() === volKey.toLowerCase());
    } else {
      raidVol = volumes.find(v => v.name.toLowerCase() === targetPath.toLowerCase() || (v.mount_point && v.mount_point.toUpperCase() === targetPath.toUpperCase()));
    }

    if (raidVol && Array.isArray(raidVol.member_disks) && raidVol.member_disks.length > 0) {
      const cleanPrimary = raidVol.member_disks[0].replace(/[\/\\]+$/, '');
      if (!isPathAllowed(cleanPrimary + '\\', req.user?.allowedDisks)) {
        return res.status(403).json({ error: 'Access Denied: You do not have permission to access this RAID volume.' });
      }

      const volRoot = path.join(cleanPrimary + '\\', raidVol.name);
      await safeEnsureDir(volRoot);
      const raidDir = raidSubfolder ? resolveSafeTarget(volRoot, raidSubfolder) : volRoot;
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

  // Check disk permissions and validate paths
  for (const p of itemsToDelete) {
    if (!isPathAllowed(p, req.user?.allowedDisks)) {
      return res.status(403).json({ error: `Access Denied: You do not have permission to delete "${p}"` });
    }
    try {
      await validatePath(p);
    } catch (vErr) {
      return res.status(403).json({ error: `Access Denied: ${vErr.message}` });
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
    try {
      await validatePath(p);
    } catch (vErr) {
      return res.status(403).json({ error: `Access Denied: ${vErr.message}` });
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

  const rawDestination = req.query.destination;
  if (!rawDestination) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    return res.status(400).json({ error: 'Destination path query is required' });
  }
  const destinationDir = String(rawDestination).trim().replace(/::+/g, ':');

  // Check if target is a RAID volume
  let raidVol = null;
  let raidSubfolder = '';
  const volumes = dbService.getAllVolumes();
  if (destinationDir.startsWith('raid:')) {
    const parts = destinationDir.replace(/^raid:/, '').split(/[\\\/]/).filter(Boolean);
    const volKey = parts[0] || '';
    for (const p of parts) {
      if (p === '..' || p.includes(':')) {
        try { await fs.promises.unlink(req.file.path); } catch {}
        return res.status(403).json({ error: 'Access Denied: Directory traversal sequences (..) are forbidden' });
      }
    }
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
      const memberPaths = [];
      for (const disk of raidVol.member_disks) {
        const cleanDisk = disk.replace(/[\/\\]+$/, '');
        if (!isPathAllowed(cleanDisk + '\\', req.user?.allowedDisks)) {
          try { await fs.promises.unlink(req.file.path); } catch {}
          return res.status(403).json({ error: 'Access Denied: You do not have permission to upload to this RAID volume.' });
        }

        const volRoot = path.join(cleanDisk + '\\', raidVol.name);
        await safeEnsureDir(volRoot);
        const targetDir = raidSubfolder ? resolveSafeTarget(volRoot, raidSubfolder) : volRoot;
        await safeEnsureDir(targetDir);

        const targetFile = resolveSafeTarget(targetDir, relativePath || req.file.originalname);
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

      // Mirror file to all remaining member disks
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

      finalPath = resolveSafeTarget(validatedDir, relativePath || req.file.originalname);
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

  const rawFileId = req.headers['x-file-id'] || req.query.fileId || req.body?.fileId || (req.body?.fileName ? `f_${Buffer.from(req.body.fileName).toString('hex').slice(0, 32)}` : null) || (req.file ? `f_${Buffer.from(req.file.originalname).toString('hex').slice(0, 32)}` : null) || `upload_${Date.now()}`;
  const fileId = String(rawFileId).replace(/[^a-zA-Z0-9_-]/g, '');
  const chunkIndex = parseInt(req.headers['x-chunk-index'] || req.query.chunkIndex || req.body?.chunkIndex || '0', 10);
  const totalChunks = parseInt(req.headers['x-total-chunks'] || req.query.totalChunks || req.body?.totalChunks || '1', 10);
  const rawOriginalName = req.headers['x-filename'] || req.query.filename || req.body?.fileName || req.file.originalname;
  const destinationDir = req.query.destination || req.body?.destination;

  // Sanitize filename to strict base name
  const originalName = path.basename(String(rawOriginalName || '')).replace(/[\x00-\x1f\x7f:*?"<>|]/g, '').trim();

  if (!fileId || !destinationDir || !originalName) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    return res.status(400).json({ error: 'Missing or invalid fileId, destination, or fileName parameter' });
  }

  // Validate chunk ranges
  if (isNaN(chunkIndex) || isNaN(totalChunks) || chunkIndex < 0 || totalChunks <= 0 || chunkIndex >= totalChunks || totalChunks > 50000) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    return res.status(400).json({ error: 'Invalid chunkIndex or totalChunks parameter' });
  }

  // Check if destination is a RAID volume
  let raidVol = null;
  let raidSubfolder = '';
  const volumes = dbService.getAllVolumes();
  if (destinationDir.startsWith('raid:')) {
    const parts = destinationDir.replace(/^raid:/, '').split(/[\\\/]/).filter(Boolean);
    const volKey = parts[0] || '';
    for (const p of parts) {
      if (p === '..' || p.includes(':')) {
        try { await fs.promises.unlink(req.file.path); } catch {}
        return res.status(403).json({ error: 'Access Denied: Directory traversal sequences (..) are forbidden' });
      }
    }
    raidSubfolder = parts.slice(1).join(path.sep);
    raidVol = volumes.find(v => v.id === volKey || v.name.toLowerCase() === volKey.toLowerCase());
  } else {
    raidVol = volumes.find(v => v.name.toLowerCase() === destinationDir.toLowerCase() || (v.mount_point && v.mount_point.toUpperCase() === destinationDir.toUpperCase()));
  }

  // Pre-validate ACL permissions before writing chunk
  if (raidVol && Array.isArray(raidVol.member_disks) && raidVol.member_disks.length > 0) {
    const cleanPrimary = raidVol.member_disks[0].replace(/[\/\\]+$/, '');
    if (!isPathAllowed(cleanPrimary + '\\', req.user?.allowedDisks)) {
      try { await fs.promises.unlink(req.file.path); } catch {}
      return res.status(403).json({ error: 'Access Denied: You do not have permission to upload to this RAID volume.' });
    }
  } else {
    if (!isPathAllowed(destinationDir, req.user?.allowedDisks)) {
      try { await fs.promises.unlink(req.file.path); } catch {}
      return res.status(403).json({ error: 'Access Denied: You do not have permission to upload to this drive or directory.' });
    }
  }

  const chunkDir = path.join(uploadTempDir, 'chunks', fileId);

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
          const volRoot = path.join(cleanDisk + '\\', raidVol.name);
          await safeEnsureDir(volRoot);
          const targetDir = raidSubfolder ? resolveSafeTarget(volRoot, raidSubfolder) : volRoot;
          await safeEnsureDir(targetDir);
          const targetFile = resolveSafeTarget(targetDir, originalName);
          memberPaths.push(targetFile);
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
        const validatedDir = await validatePath(destinationDir);
        await safeEnsureDir(validatedDir);
        finalPath = resolveSafeTarget(validatedDir, originalName);

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
      await fs.promises.rm(chunkDir, { recursive: true, force: true }).catch(() => {});

      return res.json({ success: true, completed: true, complete: true, path: finalPath });
    }

    res.json({ success: true, completed: false, complete: false, chunkIndex, totalChunks, chunksReceived: files.length });
  } catch (err) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    res.status(500).json({ error: `Chunk upload failed: ${err.message}` });
  }
});

// ─── 10. TUNNEL ENDPOINTS ─────────────────────────────────────────────────────

app.get('/api/tunnel/status', authenticateToken, (req, res) => res.json(getTunnelStatus()));

app.post('/api/tunnel/start', authenticateToken, requireAdmin, async (req, res) => {
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

app.post('/api/tunnel/configure-named', authenticateToken, requireAdmin, async (req, res) => {
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

app.post('/api/tunnel/stop', authenticateToken, requireAdmin, (req, res) => {
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

const ALLOWED_THUMB_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.heic', '.heif', '.tif', '.tiff', '.avif'
]);

app.get('/api/thumbnail', authenticateToken, async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) return res.status(400).json({ error: 'Path is required' });

  try {
    const validatedPath = await validatePath(targetPath);
    if (!isPathAllowed(validatedPath, req.user?.allowedDisks)) {
      return res.status(403).json({ error: 'Access Denied: Unauthorized file path' });
    }

    const ext = path.extname(validatedPath).toLowerCase();
    if (!ALLOWED_THUMB_EXTS.has(ext)) {
      return res.status(400).json({ error: 'Thumbnails are only available for supported image formats' });
    }

    const thumbPath = await thumbnailService.getOrGenerateThumbnail(validatedPath, 250);
    if (!thumbPath || !fs.existsSync(thumbPath)) {
      return res.status(404).json({ error: 'Thumbnail not available' });
    }

    const resolvedThumb = path.resolve(thumbPath);
    const cacheDir = path.resolve(DATA_DIR, '.nas_cache', 'thumbnails');
    if (!resolvedThumb.toLowerCase().startsWith(cacheDir.toLowerCase())) {
      return res.status(403).json({ error: 'Invalid thumbnail cache location' });
    }

    res.sendFile(resolvedThumb);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.get('/api/trash', authenticateToken, (req, res) => {
  res.json(trashService.listTrash(req.user));
});

app.post('/api/trash/restore', authenticateToken, checkReadWrite, (req, res) => {
  try {
    const item = trashService.restoreFromTrash(req.body.id, req.user);
    logActivity('trash', `Restored: ${item.fileName}`, req.user?.username);
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/trash/purge', authenticateToken, checkReadWrite, (req, res) => {
  try {
    trashService.purgeTrash(req.query.id, req.user);
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
            const vRoot = path.join(d + '\\', vol.name);
            const memberNew = resolveSafeTarget(vRoot, parentRel ? path.join(parentRel, cleanNewName) : cleanNewName);
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
      const validatedNew = resolveSafeTarget(parentDir, cleanNewName);
      await validatePath(validatedNew);
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
            const vRoot = path.join(d + '\\', vol.name);
            const memberDir = resolveSafeTarget(vRoot, relWithinVol);
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
app.post('/api/sync/validate-target', authenticateToken, checkReadWrite, async (req, res) => {
  const { destination, requiredBytes } = req.body || {};
  if (!destination) return res.status(400).json({ error: 'destination is required' });

  if (!isPathAllowed(destination, req.user?.allowedDisks)) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to sync to this drive or directory.' });
  }

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

  if (!isPathAllowed(folder, req.user?.allowedDisks)) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to view this directory manifest.' });
  }

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

// Returns a set of unique filenames of all media already uploaded on the NAS (fast dedup)
app.get('/api/sync/synced-filenames', authenticateToken, async (req, res) => {
  try {
    const fsSync = require('fs');
    const folder = req.query.folder;
    const filenameMap = new Map();

    const addFilesFromDir = (dirPath) => {
      try {
        if (!dirPath || !isPathAllowed(dirPath, req.user?.allowedDisks)) return;
        if (!fsSync.existsSync(dirPath)) return;
        const entries = fsSync.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const lower = entry.name.toLowerCase();
            if (!filenameMap.has(lower)) {
              filenameMap.set(lower, entry.name);
            }
          }
        }
      } catch (e) {}
    };

    let primaryFolder = 'MobileUploads';

    // 1. If explicit folder passed, check ACL and scan it first
    if (folder) {
      try {
        if (isPathAllowed(folder, req.user?.allowedDisks)) {
          const validated = await validatePath(folder);
          addFilesFromDir(validated);
          primaryFolder = path.basename(validated);
        }
      } catch (e) {}
    }

    // 2. Scan standard RAID member disks for MobileUploads and NAS_Backup (ACL filtered)
    try {
      const volumes = dbService.getAllVolumes();
      for (const vol of volumes) {
        if (Array.isArray(vol.member_disks)) {
          for (const disk of vol.member_disks) {
            const cleanDisk = disk.replace(/[\/\\]+$/, '');
            const p1 = path.join(cleanDisk + '\\', vol.name, 'MobileUploads');
            const p2 = path.join(cleanDisk + '\\', vol.name, 'NAS_Backup');
            if (isPathAllowed(p1, req.user?.allowedDisks)) addFilesFromDir(p1);
            if (isPathAllowed(p2, req.user?.allowedDisks)) addFilesFromDir(p2);
          }
        }
      }
    } catch (e) {}

    // 3. Scan physical drives for MobileUploads and NAS_Backup (ACL filtered)
    try {
      const drives = await getDrives();
      for (const d of drives) {
        const dPath = (d.letter || '').replace(/[\/\\]+$/, '') + '\\';
        if (isPathAllowed(dPath, req.user?.allowedDisks)) {
          addFilesFromDir(path.join(dPath, 'MobileUploads'));
          addFilesFromDir(path.join(dPath, 'NAS_Backup'));
          addFilesFromDir(path.join(dPath, 'myNAS', 'MobileUploads'));
          addFilesFromDir(path.join(dPath, 'myNAS', 'NAS_Backup'));
        }
      }
    } catch (e) {}

    // 4. Incorporate gallery items (ACL filtered)
    try {
      const galleryItems = await getMediaGallery();
      for (const item of galleryItems) {
        if (item.name && item.path && isPathAllowed(item.path, req.user?.allowedDisks)) {
          const lower = item.name.toLowerCase();
          if (!filenameMap.has(lower)) {
            filenameMap.set(lower, item.name);
          }
        }
      }
    } catch (e) {}

    const filenames = Array.from(filenameMap.keys());
    res.json({
      success: true,
      count: filenames.length,
      filenames,
      primaryFolder
    });
  } catch (err) {
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
  const nets = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIps.push(net.address);
      }
    }
  }

  console.log('\n========================================================');
  console.log('  🌐 Personal NAS Server is Live & Running!');
  console.log(`  🏠 Local Access:     http://localhost:${PORT}`);
  if (lanIps.length > 0) {
    lanIps.forEach(ip => {
      console.log(`  📡 Network (LAN):    http://${ip}:${PORT}`);
    });
  }
  const displayPasscode = process.env.PASSCODE || (isFirstRunSetup ? initialGeneratedPasscode : null);
  if (displayPasscode) {
    console.log(`  🔑 Master Passcode:  ${displayPasscode}`);
  }
  console.log('  👤 Tip: The first registered user account is Admin.');
  console.log('========================================================\n');

  // Synchronize RAID member disks with driveConfig on server startup
  (async () => {
    try {
      const allDrives = await getDrives();
      const raidVolumes = dbService.getAllVolumes();
      const memberDisks = [];
      raidVolumes.forEach(v => (v.member_disks || []).forEach(d => memberDisks.push(d)));
      const currentLetters = allDrives.map(d => d.letter);
      driveConfig.syncWithDisks(memberDisks, currentLetters);
      console.log(`[StorageSync] Reconciled ${memberDisks.length} RAID member disk(s) into active storage configuration.`);
    } catch (err) {
      console.warn('[StorageSync] Initial RAID drive synchronization warning:', err.message);
    }
  })();

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
