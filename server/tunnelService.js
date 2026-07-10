const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const CLOUDFLARED_DIR = path.join(__dirname, 'cloudflared');
const CLOUDFLARED_EXE = path.join(CLOUDFLARED_DIR, 'cloudflared.exe');
const TUNNEL_CONFIG_PATH = path.join(CLOUDFLARED_DIR, 'tunnel_state.json');

// In-memory tunnel state
let tunnelProcess = null;
let tunnelUrl = null;
let tunnelStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'error'
let tunnelError = null;

/**
 * Downloads cloudflared.exe if not already present.
 * @returns {Promise<string>} Path to the cloudflared executable.
 */
async function ensureCloudflared() {
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
        // Handle redirects (GitHub releases redirect)
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
 * Starts a quick tunnel (no Cloudflare account required).
 * Uses `cloudflared tunnel --url http://localhost:<port>` which generates a free *.trycloudflare.com URL.
 * @param {number} port The local server port to expose.
 * @returns {Promise<string>} The public tunnel URL.
 */
async function startTunnel(port) {
  if (tunnelStatus === 'running' && tunnelProcess) {
    return tunnelUrl;
  }

  tunnelStatus = 'starting';
  tunnelError = null;
  tunnelUrl = null;

  try {
    const exePath = await ensureCloudflared();

    return new Promise((resolve, reject) => {
      const proc = spawn(exePath, ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      tunnelProcess = proc;
      let resolved = false;

      // Cloudflared prints the assigned URL to stderr
      const handleOutput = (data) => {
        const output = data.toString();
        
        // Look for the trycloudflare URL in output
        const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !resolved) {
          resolved = true;
          tunnelUrl = urlMatch[0];
          tunnelStatus = 'running';
          
          // Save state to disk
          saveTunnelState({ url: tunnelUrl, port });
          
          console.log(`[Tunnel] Public URL: ${tunnelUrl}`);
          resolve(tunnelUrl);
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

      // Timeout: if no URL found within 30 seconds, reject
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          tunnelStatus = 'error';
          tunnelError = 'Timed out waiting for tunnel URL';
          stopTunnel();
          reject(new Error('Timed out waiting for cloudflared to assign a URL'));
        }
      }, 30000);
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
  saveTunnelState(null);
}

/**
 * Returns current tunnel state.
 */
function getTunnelStatus() {
  return {
    status: tunnelStatus,
    url: tunnelUrl,
    error: tunnelError
  };
}

/**
 * Saves tunnel state to disk for persistence across server restarts.
 */
function saveTunnelState(state) {
  try {
    if (state) {
      fs.writeFileSync(TUNNEL_CONFIG_PATH, JSON.stringify(state, null, 2));
    } else if (fs.existsSync(TUNNEL_CONFIG_PATH)) {
      fs.unlinkSync(TUNNEL_CONFIG_PATH);
    }
  } catch {}
}

module.exports = {
  ensureCloudflared,
  startTunnel,
  stopTunnel,
  getTunnelStatus
};
