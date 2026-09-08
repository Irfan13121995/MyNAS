const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = process.env.NAS_DATA_DIR || __dirname;
const TUNNEL_CONFIG_PATH = path.join(DATA_DIR, 'tunnel_config.json');

function resolveCloudflaredPath() {
  const candidates = [
    // 1. Explicit environment variable
    process.env.CLOUDFLARED_PATH,
    // 2. Electron unpacked / resources directory
    process.resourcesPath ? path.join(process.resourcesPath, 'cloudflared', 'cloudflared.exe') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'cloudflared', 'cloudflared.exe') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'cloudflared.exe') : null,
    // 3. User Data Directory
    path.join(DATA_DIR, 'cloudflared', 'cloudflared.exe'),
    path.join(DATA_DIR, 'cloudflared.exe'),
    // 4. Source tree
    path.join(__dirname, 'cloudflared', 'cloudflared.exe'),
    // 5. PKG standalone binary dir
    process.pkg ? path.join(path.dirname(process.execPath), 'cloudflared', 'cloudflared.exe') : null
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(DATA_DIR, 'cloudflared', 'cloudflared.exe');
}

let CLOUDFLARED_EXE = resolveCloudflaredPath();
let CLOUDFLARED_DIR = path.dirname(CLOUDFLARED_EXE);

// In-memory tunnel state
let tunnelProcess = null;
let tunnelUrl = null;
let tunnelMode = 'quick'; // 'quick' | 'named'
let tunnelStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'error'
let tunnelError = null;

function getNamedTunnelConfig() {
  try {
    // Check DATA_DIR first, fallback to legacy path in source
    const configPath = fs.existsSync(TUNNEL_CONFIG_PATH)
      ? TUNNEL_CONFIG_PATH
      : path.join(__dirname, 'cloudflared', 'tunnel_config.json');

    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      if (cfg) {
        if (!cfg.customUrl || cfg.customUrl.includes('eu.org')) {
          cfg.customUrl = 'https://mynas-hi.online';
        }
        return cfg;
      }
    }
  } catch (err) {
    console.warn('[Tunnel] Error reading tunnel config:', err.message);
  }
  return { mode: 'quick', token: '', customUrl: 'https://mynas-hi.online' };
}

function saveNamedTunnelConfig(config) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(TUNNEL_CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.warn('[Tunnel] Failed to save tunnel config:', err.message);
  }
}

/**
 * Downloads cloudflared.exe if not already present.
 * @returns {Promise<string>} Path to the cloudflared executable.
 */
async function ensureCloudflared() {
  CLOUDFLARED_EXE = resolveCloudflaredPath();
  CLOUDFLARED_DIR = path.dirname(CLOUDFLARED_EXE);

  if (fs.existsSync(CLOUDFLARED_EXE)) {
    return CLOUDFLARED_EXE;
  }

  if (!fs.existsSync(CLOUDFLARED_DIR)) {
    fs.mkdirSync(CLOUDFLARED_DIR, { recursive: true });
  }

  const downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  
  console.log('[Tunnel] Downloading cloudflared...');

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(CLOUDFLARED_EXE);

    const downloadWithRedirects = (url) => {
      https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return downloadWithRedirects(response.headers.location);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('[Tunnel] cloudflared downloaded successfully.');
          resolve(CLOUDFLARED_EXE);
        });
      }).on('error', (err) => {
        fs.unlink(CLOUDFLARED_EXE, () => {});
        reject(err);
      });
    };

    downloadWithRedirects(downloadUrl);
  });
}

/**
 * Starts Cloudflare Tunnel (either Quick Tunnel or Permanent Named Tunnel with token).
 * @param {number} port Local server port.
 * @param {'quick'|'named'} requestedMode Tunnel mode.
 * @param {string} token Cloudflare Zero Trust Tunnel Token (for named tunnels).
 * @param {string} customUrl Public Custom Domain URL (e.g. https://nas.mydomain.com).
 * @returns {Promise<string>} Active Tunnel Public URL.
 */
async function startTunnel(port = 3000, requestedMode = 'quick', token = '', customUrl = '') {
  if (tunnelStatus === 'running' && tunnelProcess) {
    return tunnelUrl;
  }

  tunnelStatus = 'starting';
  tunnelError = null;
  tunnelUrl = null;
  tunnelMode = requestedMode;

  try {
    const exePath = await ensureCloudflared();

    return new Promise((resolve, reject) => {
      let args = [];
      if (requestedMode === 'named' && token) {
        // Permanent Named Tunnel with token
        args = ['tunnel', 'run', '--token', token.trim()];
        let formattedUrl = customUrl ? customUrl.trim() : '';
        if (!formattedUrl || formattedUrl.includes('eu.org')) {
          formattedUrl = 'https://mynas-hi.online';
        }
        tunnelUrl = formattedUrl;
      } else {
        // Free Quick Tunnel (*.trycloudflare.com)
        args = ['tunnel', '--url', `http://localhost:${port}`];
      }

      console.log(`[Tunnel] Starting cloudflared in ${requestedMode} mode...`);
      const proc = spawn(exePath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      tunnelProcess = proc;
      let resolved = false;

      const handleOutput = (data) => {
        const output = data.toString();

        if (output.includes('Invalid tunnel secret') || output.includes('Unauthorized')) {
          if (!resolved) {
            resolved = true;
            tunnelStatus = 'error';
            tunnelError = 'Cloudflare rejected token: Invalid tunnel secret. Please copy a fresh token from Cloudflare Zero Trust.';
            stopTunnel();
            reject(new Error(tunnelError));
          }
          return;
        }

        if (requestedMode === 'named') {
          // Check for successful registration line
          if ((output.includes('Registered tunnel connection') || output.includes('Registered connector')) && !resolved) {
            resolved = true;
            tunnelStatus = 'running';
            saveNamedTunnelConfig({ mode: 'named', token, customUrl });
            console.log(`[Tunnel] Permanent Named Tunnel Connected: ${tunnelUrl}`);
            resolve(tunnelUrl);
          }
        } else {
          // Look for trycloudflare URL in output
          const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
          if (urlMatch && !resolved) {
            resolved = true;
            tunnelUrl = urlMatch[0];
            tunnelStatus = 'running';
            saveNamedTunnelConfig({ mode: 'quick', token: '', customUrl: '' });
            console.log(`[Tunnel] Quick Public URL: ${tunnelUrl}`);
            resolve(tunnelUrl);
          }
        }
      };

      proc.stdout.on('data', handleOutput);
      proc.stderr.on('data', handleOutput);

      proc.on('error', (err) => {
        tunnelStatus = 'error';
        tunnelError = err.message;
        tunnelProcess = null;
        if (!resolved) {
          reject(new Error(`Failed to start tunnel: ${err.message}`));
        }
      });

      proc.on('close', (code) => {
        tunnelStatus = 'stopped';
        tunnelProcess = null;
        tunnelUrl = null;
        if (!resolved) {
          reject(new Error(`Tunnel process exited with code ${code}`));
        }
      });

      // Timeout safety: if named tunnel connects, resolve after 4s if output wasn't matched
      setTimeout(() => {
        if (!resolved && requestedMode === 'named' && tunnelProcess) {
          resolved = true;
          tunnelStatus = 'running';
          saveNamedTunnelConfig({ mode: 'named', token, customUrl });
          console.log(`[Tunnel] Permanent Named Tunnel active: ${tunnelUrl}`);
          resolve(tunnelUrl);
        } else if (!resolved) {
          resolved = true;
          tunnelStatus = 'error';
          tunnelError = 'Timed out waiting for cloudflared to assign a URL';
          stopTunnel();
          reject(new Error('Timed out waiting for cloudflared connection'));
        }
      }, requestedMode === 'named' ? 5000 : 30000);
    });
  } catch (err) {
    tunnelStatus = 'error';
    tunnelError = err.message;
    throw err;
  }
}

/**
 * Stops the running tunnel process.
 */
function stopTunnel() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill('SIGTERM');
    } catch {
      try { tunnelProcess.kill(); } catch {}
    }
    tunnelProcess = null;
  }
  tunnelUrl = null;
  tunnelStatus = 'stopped';
  tunnelError = null;
}

/**
 * Returns current tunnel status.
 */
function getTunnelStatus() {
  const savedConfig = getNamedTunnelConfig();
  return {
    status: tunnelStatus,
    mode: tunnelMode,
    url: tunnelUrl,
    error: tunnelError,
    savedConfig
  };
}

module.exports = {
  ensureCloudflared,
  startTunnel,
  stopTunnel,
  getTunnelStatus,
  getNamedTunnelConfig,
  saveNamedTunnelConfig
};
