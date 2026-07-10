const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Bonjour } = require('bonjour-service');
const multer = require('multer');

// Configure upload temp storage
const uploadTempDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadTempDir)) {
  fs.mkdirSync(uploadTempDir, { recursive: true });
}
const upload = multer({ dest: uploadTempDir });

// 1. Auto-generate .env on first run if it doesn't exist
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  const secret = crypto.randomBytes(32).toString('hex');
  const passcode = Math.floor(100000 + Math.random() * 900000).toString(); // Random 6-digit pin
  const envContent = `PORT=3000\nJWT_SECRET=${secret}\nPASSCODE=${passcode}\n`;
  fs.writeFileSync(envPath, envContent);
}

// Load env configuration
require('dotenv').config();

const { getDrives } = require('./driveService');
const { listFiles } = require('./fileService');
const { streamFile } = require('./streamService');
const { startTunnel, stopTunnel, getTunnelStatus } = require('./tunnelService');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const PASSCODE = process.env.PASSCODE;

// Enable CORS so the React Native app can call the APIs
app.use(cors());
app.use(express.json());

console.log('====================================');
console.log(`  Personal NAS Server Active Passcode: ${PASSCODE}`);
console.log('  Use this passcode to pair the mobile client.');
console.log('====================================');

// 2. Authentication Middleware
const authenticateToken = (req, res, next) => {
  // Support both standard Bearer Authorization header and URL query parameters for media players
  let token = req.headers['authorization']?.split(' ')[1];
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// 3. API Endpoints

// Authentication/Login Endpoint
app.post('/api/auth/login', (req, res) => {
  const { passcode } = req.body;
  if (!passcode) {
    return res.status(400).json({ error: 'Passcode is required' });
  }

  if (passcode.toString() === PASSCODE) {
    const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  }

  return res.status(401).json({ error: 'Incorrect passcode' });
});

// Verify Token Endpoint
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true });
});

// List Drives Endpoint
app.get('/api/drives', authenticateToken, async (req, res) => {
  try {
    const drives = await getDrives();
    res.json(drives);
  } catch (err) {
    res.status(500).json({ error: `Failed to retrieve drives: ${err.message}` });
  }
});

// List Files Endpoint
app.get('/api/files', authenticateToken, async (req, res) => {
  const targetPath = req.query.path;

  try {
    // If no path is provided, return logical drives formatted as directories
    if (!targetPath) {
      const drives = await getDrives();
      const driveDirectories = drives.map(d => ({
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

    // List folder contents
    const files = await listFiles(targetPath);
    // Append absolute path helper to each file to make client queries easier
    const results = files.map(f => ({
      ...f,
      path: path.join(targetPath, f.name)
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: `Failed to list files: ${err.message}` });
  }
});

// Stream Media Endpoint
app.get('/api/stream', authenticateToken, async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) {
    return res.status(400).json({ error: 'Path is required to stream' });
  }

  await streamFile(targetPath, req, res);
});

// File Upload Endpoint
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const destinationDir = req.query.destination;
  if (!destinationDir) {
    try { await fs.promises.unlink(req.file.path); } catch {}
    return res.status(400).json({ error: 'Destination path query is required' });
  }

  try {
    const { validatePath } = require('./fileService');
    const validatedDir = await validatePath(destinationDir);

    // Create target folder structure if missing
    await fs.promises.mkdir(validatedDir, { recursive: true });

    const finalPath = path.join(validatedDir, req.file.originalname);
    
    // Move uploaded file to target folder, fallback to copy/delete on cross-device errors
    try {
      await fs.promises.rename(req.file.path, finalPath);
    } catch (renameErr) {
      if (renameErr.code === 'EXDEV') {
        await fs.promises.copyFile(req.file.path, finalPath);
        await fs.promises.unlink(req.file.path);
      } else {
        throw renameErr;
      }
    }

    res.json({ success: true, path: finalPath });
  } catch (err) {
    // Cleanup temporary upload
    try { await fs.promises.unlink(req.file.path); } catch {}
    res.status(500).json({ error: `File upload failed: ${err.message}` });
  }
});

// 5. Tunnel Management Endpoints

// Get tunnel status
app.get('/api/tunnel/status', authenticateToken, (req, res) => {
  res.json(getTunnelStatus());
});

// Start tunnel
app.post('/api/tunnel/start', authenticateToken, async (req, res) => {
  try {
    const url = await startTunnel(PORT);
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ error: `Failed to start tunnel: ${err.message}` });
  }
});

// Stop tunnel
app.post('/api/tunnel/stop', authenticateToken, (req, res) => {
  stopTunnel();
  res.json({ success: true });
});

// 6. Start Server and Publish mDNS Service
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

    service.on('up', () => {
      console.log(`mDNS Service 'Personal NAS Server' successfully published (_personal-nas._tcp.local)`);
    });

    service.on('error', (err) => {
      console.error('mDNS publication error:', err);
    });
  } catch (err) {
    console.error('Failed to initialize Bonjour/mDNS service discovery:', err);
  }
});

// Graceful shutdown: kill tunnel on server exit
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  stopTunnel();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopTunnel();
  process.exit(0);
});
