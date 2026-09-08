const { app, BrowserWindow, Tray, Menu, shell, clipboard, Notification } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

// 1. Initialize persistent User Data Directory for Windows App Store & NSIS packaging
const DATA_DIR = path.join(app.getPath('appData'), 'PersonalNAS');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
process.env.NAS_DATA_DIR = DATA_DIR;

let mainWindow = null;
let tray = null;
const PORT = process.env.PORT || 3000;

// Ensure single instance of app
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Configure Windows Firewall rule silently on first launch
function configureFirewall() {
  if (process.platform === 'win32') {
    exec('netsh advfirewall firewall show rule name="PersonalNAS_HTTP"', (err, stdout) => {
      if (err || !stdout.includes('PersonalNAS_HTTP')) {
        exec('netsh advfirewall firewall add rule name="PersonalNAS_HTTP" dir=in action=allow protocol=TCP localport=3000', (addErr) => {
          if (!addErr) console.log('Windows Firewall rule PersonalNAS_HTTP created successfully.');
        });
      }
    });
  }
}

function getLocalLanUrl() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return `http://${net.address}:${PORT}`;
      }
    }
  }
  return `http://localhost:${PORT}`;
}

function startBackendServer() {
  try {
    configureFirewall();
    // Require and start Express index.js server
    require('./index.js');
    console.log('Backend Express server initialized via Electron main.js with DATA_DIR:', DATA_DIR);
  } catch (err) {
    console.error('Failed to start backend server:', err);
  }
}

function waitForServer(callback, retries = 30) {
  http.get(`http://localhost:${PORT}/api/auth/status`, (res) => {
    if (res.statusCode === 200) {
      callback();
    } else if (retries > 0) {
      setTimeout(() => waitForServer(callback, retries - 1), 300);
    } else {
      callback();
    }
  }).on('error', () => {
    if (retries > 0) {
      setTimeout(() => waitForServer(callback, retries - 1), 300);
    } else {
      callback();
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Personal NAS — Control Panel & Dashboard',
    icon: path.join(__dirname, 'public', 'favicon.png'),
    backgroundColor: '#0B0F17',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Open external links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    // Hide to tray instead of closing app completely
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: 'Personal NAS is still running',
          body: 'Personal NAS server remains active in your Windows system tray.'
        }).show();
      }
    }
    return false;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'public', 'favicon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Personal NAS Server — Active on Port 3000');

  const updateTrayMenu = () => {
    const isAutoStart = app.getLoginItemSettings().openAtLogin;
    const lanUrl = getLocalLanUrl();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `🟢 Personal NAS Server (Port ${PORT})`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: '🖥️ Open Desktop Dashboard',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow();
          }
        }
      },
      {
        label: '🌐 Open in Web Browser',
        click: () => shell.openExternal(`http://localhost:${PORT}`)
      },
      { type: 'separator' },
      {
        label: '📡 Copy Network LAN URL',
        click: () => {
          clipboard.writeText(lanUrl);
          if (Notification.isSupported()) {
            new Notification({
              title: 'Network URL Copied',
              body: `LAN URL (${lanUrl}) copied to clipboard!`
            }).show();
          }
        }
      },
      {
        label: '🔑 Copy Master Passcode',
        click: () => {
          const passcode = process.env.PASSCODE || '';
          clipboard.writeText(passcode);
          if (Notification.isSupported()) {
            new Notification({
              title: 'Passcode Copied',
              body: `Master Passcode (${passcode}) copied to clipboard!`
            }).show();
          }
        }
      },
      { type: 'separator' },
      {
        label: '🚀 Start Personal NAS with Windows',
        type: 'checkbox',
        checked: isAutoStart,
        click: (menuItem) => {
          app.setLoginItemSettings({
            openAtLogin: menuItem.checked,
            openAsHidden: true,
            name: 'Personal NAS'
          });
          updateTrayMenu();
        }
      },
      { type: 'separator' },
      {
        label: '❌ Exit Personal NAS',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
  };

  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
}

app.whenReady().then(() => {
  startBackendServer();

  waitForServer(() => {
    createMainWindow();
    createTray();
  });
});

app.on('window-all-closed', (e) => {
  // Prevent app from quitting when all windows are closed
  e.preventDefault();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
