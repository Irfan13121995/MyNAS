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
  const envContent = `PORT=3000\nJWT_SECRET=${secret}\nPASSCODE=${passcode}\nREQUIRE_EMAIL_VERIFICATION=true\n`;
  fs.writeFileSync(envPath, envContent);
}

require('dotenv').config();

const { getDrives } = require('./driveService');
const { listFiles, validatePath, getMediaGallery, searchFiles } = require('./fileService');
const { streamFile } = require('./streamService');
const { startTunnel, stopTunnel, getTunnelStatus, getNamedTunnelConfig, saveNamedTunnelConfig } = require('./tunnelService');
const driveConfig = require('./driveConfigService');
const usersService = require('./usersService');
const thumbnailService = require('./thumbnailService');
const trashService = require('./trashService');
const archiver = require('archiver');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const PASSCODE = process.env.PASSCODE;
const SERVER_START_TIME = Date.now();

// In-memory activity log (last 50 events)
const activityLog = [];
function logActivity(type, detail) {
  activityLog.unshift({ type, detail, time: new Date().toISOString() });
  if (activityLog.length > 50) activityLog.pop();
}

const helmet = require('helmet');

// Global Rate Limiter for API Endpoints (150 requests per min per IP)
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
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
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.ico') || filePath.endsWith('.svg')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin) return callback(null, true);
    // Allow localhost, LAN IPs, and Cloudflare tunnel URLs
    if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.)/)
        || origin.endsWith('.trycloudflare.com')
        || origin.endsWith('.cloudflare.com')) {
      return callback(null, true);
    }
    callback(new Error('CORS: Origin not allowed'));
  },
  credentials: true
}));
app.use(express.json());
app.use('/api/', globalApiLimiter);

console.log('====================================');
console.log(`  Personal NAS Server Active Passcode: ${PASSCODE}`);
console.log('  Dashboard: http://localhost:' + PORT);
console.log('====================================');

// 2. Authentication Middleware
const authenticateToken = (req, res, next) => {
  let token = req.headers['authorization']?.split(' ')[1];
  if (!token && req.query.token) token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentication token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

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
    logActivity('auth', 'New account created: ' + username);
    
    // Check if email verification is required and pending
    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== 'false';
    if (requireVerification && email && !result.user.emailVerified) {
      return res.json({ 
        message: 'Account created! Please check your email to verify your account before logging in.',
        requireEmailVerification: true,
        devLink: result.emailResult?.devLink
      });
    }

    const token = jwt.sign({ authenticated: true, username }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, username, user: result.user });
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
    if (passcode.toString() === PASSCODE) {
      const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '7d' });
      logActivity('auth', 'Dashboard login via passcode');
      return res.json({ token });
    }
    return res.status(401).json({ error: 'Incorrect passcode' });
  }
  
  if (username && password) {
    const result = await usersService.verifyPassword(username, password);
    if (result.success) {
      const token = jwt.sign({ authenticated: true, username: result.user.username }, JWT_SECRET, { expiresIn: '7d' });
      logActivity('auth', 'Dashboard login: ' + result.user.username);
      return res.json({ token, username: result.user.username, user: result.user });
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
    logActivity('auth', `Email verified for user: ${result.username}`);
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
  res.json({ valid: true });
});

app.get('/api/users', authenticateToken, (req, res) => {
  try {
    const users = usersService.getAllUsers();
    return res.json({ success: true, count: users.length, users });
  } catch (err) {
    return res.status(500).json({ error: `Failed to fetch users: ${err.message}` });
  }
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
    port: PORT,
  });
});

// ─── 5. ACTIVITY LOG ──────────────────────────────────────────────────────────

app.get('/api/activity', authenticateToken, (req, res) => {
  res.json(activityLog);
});

// ─── 6. DRIVES ENDPOINTS ─────────────────────────────────────────────────────

// Get NAS-allowed drives (filtered by config)
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

    res.json(drives);
  } catch (err) {
    res.status(500).json({ error: `Failed to retrieve drives: ${err.message}` });
  }
});

// Get ALL available drives (for "Add Storage" modal)
app.get('/api/drives/available', authenticateToken, async (req, res) => {
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
app.post('/api/drives/add', authenticateToken, async (req, res) => {
  const { drivePath, label } = req.body;
  if (!drivePath) return res.status(400).json({ error: 'drivePath is required' });

  try {
    // If first action, initialize config with all current auto-detected drives
    const currentDrives = await getDrives();
    const currentLetters = currentDrives.map(d => d.letter);
    driveConfig.initializeWithDrives(currentLetters);

    driveConfig.addPath(drivePath, label || drivePath);
    logActivity('storage', `Added storage: ${drivePath}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove a drive/path from the NAS
app.delete('/api/drives/remove', authenticateToken, async (req, res) => {
  const { drivePath } = req.body;
  if (!drivePath) return res.status(400).json({ error: 'drivePath is required' });

  try {
    const currentDrives = await getDrives();
    const currentLetters = currentDrives.map(d => d.letter);
    driveConfig.initializeWithDrives(currentLetters);

    driveConfig.removePath(drivePath);
    logActivity('storage', `Removed storage: ${drivePath}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 7. FILES ENDPOINTS ──────────────────────────────────────────────────────

app.get('/api/files', authenticateToken, async (req, res) => {
  const targetPath = req.query.path;

  try {
    if (!targetPath) {
      const drives = await getDrives();
      const allowedPaths = driveConfig.getAllowedPaths();

      let filteredDrives = drives;
      if (allowedPaths !== null) {
        filteredDrives = drives.filter(d =>
          allowedPaths.includes(d.letter) || allowedPaths.includes(d.letter + '\\')
        );
      }

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
      return res.json(driveDirectories);
    }

    // Clean double-colon or malformed drive path parameters (e.g. D::\ -> D:\)
    let cleanPath = targetPath.replace(/::+/g, ':').trim();
    if (/^[a-zA-Z]:?$/.test(cleanPath)) {
      cleanPath = cleanPath.replace(':', '') + ':\\';
    }
    const normalizedTargetPath = cleanPath;
    const files = await listFiles(normalizedTargetPath);
    logActivity('browse', `Browsed: ${normalizedTargetPath}`);
    const results = files.map(f => ({ ...f, path: path.join(normalizedTargetPath, f.name) }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: `Failed to list files: ${err.message}` });
  }
});

// ─── 7.2. GLOBAL DISK SEARCH ENDPOINT ───────────────────────────────────────

app.get('/api/files/search', authenticateToken, async (req, res) => {
  const query = req.query.q;
  const targetDrive = req.query.drive;

  if (!query || !query.trim()) {
    return res.json([]);
  }

  try {
    const results = await searchFiles(query, targetDrive);
    logActivity('search', `Global search for: "${query}" (${results.length} found)`);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: `Failed to execute search: ${err.message}` });
  }
});

// ─── 7.5. GALLERY ENDPOINT ───────────────────────────────────────────────────

app.get('/api/gallery', authenticateToken, async (req, res) => {
  const targetDrive = req.query.drive;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const allMedia = await getMediaGallery(targetDrive);
    const totalItems = allMedia.length;
    const totalPages = Math.ceil(totalItems / limit);
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

// ─── 8. STREAM ENDPOINT ──────────────────────────────────────────────────────

app.get('/api/stream', authenticateToken, async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) return res.status(400).json({ error: 'Path is required to stream' });
  try {
    await validatePath(targetPath);
    logActivity('stream', `Streamed: ${path.basename(targetPath)}`);
    await streamFile(targetPath, req, res);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// ─── 9. UPLOAD ENDPOINT ──────────────────────────────────────────────────────

app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const destinationDir = req.query.destination;
  if (!destinationDir) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    return res.status(400).json({ error: 'Destination path query is required' });
  }

  try {
    const validatedDir = await validatePath(destinationDir);
    await fs.promises.mkdir(validatedDir, { recursive: true });
    const finalPath = path.join(validatedDir, req.file.originalname);

    try {
      await fs.promises.rename(req.file.path, finalPath);
    } catch (renameErr) {
      if (renameErr.code === 'EXDEV') {
        await fs.promises.copyFile(req.file.path, finalPath);
        await fs.promises.unlink(req.file.path);
      } else throw renameErr;
    }

    logActivity('upload', `Uploaded: ${req.file.originalname}`);
    res.json({ success: true, path: finalPath });
  } catch (err) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    res.status(500).json({ error: `File upload failed: ${err.message}` });
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
    logActivity('tunnel', `Tunnel (${targetMode}) activated: ${url}`);
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
    logActivity('tunnel', `Permanent Named Tunnel configured: ${url}`);
    res.json({ success: true, mode: 'named', url });
  } catch (err) {
    res.status(500).json({ error: `Failed to configure named tunnel: ${err.message}` });
  }
});

app.post('/api/tunnel/stop', authenticateToken, (req, res) => {
  stopTunnel();
  logActivity('tunnel', 'Tunnel deactivated');
  res.json({ success: true });
});

// ─── 10.5. SYSTEM CONTROL & MAINTENANCE ENDPOINTS ──────────────────────────────

app.post('/api/system/reboot', authenticateToken, (req, res) => {
  logActivity('system', 'System reboot requested');
  res.json({ success: true, message: 'System reboot request acknowledged.' });
});

app.post('/api/system/shutdown', authenticateToken, (req, res) => {
  logActivity('system', 'System shutdown requested');
  res.json({ success: true, message: 'System shutdown request acknowledged.' });
});

app.post('/api/system/cleanup', authenticateToken, async (req, res) => {
  try {
    const files = await fs.promises.readdir(uploadTempDir);
    let count = 0;
    for (const f of files) {
      await fs.promises.unlink(path.join(uploadTempDir, f)).catch(() => {});
      count++;
    }
    logActivity('system', `Cleaned up ${count} temporary files`);
    res.json({ success: true, filesCleaned: count });
  } catch (err) {
    res.status(500).json({ error: `Cleanup failed: ${err.message}` });
  }
});

app.post('/api/drives/refresh', authenticateToken, async (req, res) => {
  try {
    const drives = await getDrives();
    logActivity('storage', `Refreshed drive list (${drives.length} drives detected)`);
    res.json({ success: true, count: drives.length, drives });
  } catch (err) {
    res.status(500).json({ error: `Drive refresh failed: ${err.message}` });
  }
});

// ─── 10.8. THUMBNAIL, TRASH & BATCH FILES ENDPOINTS ────────────────────────────

app.get('/api/thumbnail', authenticateToken, async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) return res.status(400).json({ error: 'Path is required' });
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

app.post('/api/trash/restore', authenticateToken, (req, res) => {
  try {
    const item = trashService.restoreFromTrash(req.body.id);
    logActivity('trash', `Restored: ${item.fileName}`);
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/trash/purge', authenticateToken, (req, res) => {
  try {
    trashService.purgeTrash(req.query.id);
    logActivity('trash', 'Purged trash item');
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/files/delete', authenticateToken, (req, res) => {
  const targetPath = req.body.path;
  if (!targetPath) return res.status(400).json({ error: 'Path is required' });
  try {
    const item = trashService.moveToTrash(targetPath);
    logActivity('trash', `Moved to trash: ${item.fileName}`);
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/batch-zip', authenticateToken, async (req, res) => {
  const { paths } = req.body;
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'Paths array is required' });
  }

  // Validate every path before archiving
  try {
    for (const p of paths) {
      await validatePath(p);
    }
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }

  res.attachment('nas_archive.zip');
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => { console.error('Archiver error:', err); if (!res.headersSent) res.status(500).json({ error: err.message }); });
  archive.pipe(res);

  for (const p of paths) {
    try {
      const stat = await fs.promises.stat(p);
      if (stat.isFile()) {
        archive.file(p, { name: path.basename(p) });
      } else if (stat.isDirectory()) {
        archive.directory(p, path.basename(p));
      }
    } catch (err) {
      // Ignore if not exists
    }
  }
  archive.finalize();
});

// ─── 10.9. SYNC MANIFEST & CHUNKED UPLOAD ───────────────────────────────────

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

      logActivity('upload', `Chunked upload complete: ${fileName}`);
      return res.json({ success: true, complete: true, path: finalPath });
    }

    res.json({ success: true, complete: false, chunksReceived: existingChunks.length, totalChunks: total });
  } catch (err) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// ─── 11. SPA FALLBACK ─────────────────────────────────────────────────────────
// Serve index.html for any non-API route (needed for SPA routing)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ─── 12. START SERVER ─────────────────────────────────────────────────────────

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);

  try {
    const bonjour = new Bonjour();
    const service = bonjour.publish({
      name: 'Personal NAS Server',
      type: 'personal-nas',
      port: parseInt(PORT),
      txt: { version: '1.0.0' }
    });
    service.on('up', () => console.log('mDNS published: _personal-nas._tcp.local'));
    service.on('error', err => console.log('mDNS status:', err.message));
  } catch (err) {
    console.error('Failed to initialize mDNS:', err);
  }
});

process.on('SIGINT', () => { console.log('\nShutting down...'); stopTunnel(); process.exit(0); });
process.on('SIGTERM', () => { stopTunnel(); process.exit(0); });
