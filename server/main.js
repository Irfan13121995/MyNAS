const { app, BrowserWindow, Tray, Menu, shell, clipboard, Notification } = require('electron');
const path = require('path');
const http = require('http');

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

function startBackendServer() {
  try {
    // Require and start Express index.js server
    require('./index.js');
    console.log('Backend Express server initialized via Electron main.js');
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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🌐 Open Personal NAS Dashboard',
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
      label: '🌐 Open in Default Web Browser',
      click: () => shell.openExternal(`http://localhost:${PORT}`)
    },
    { type: 'separator' },
    {
      label: '📋 Copy Passcode to Clipboard',
      click: () => {
        const passcode = process.env.PASSCODE || '881612';
        clipboard.writeText(passcode);
        if (Notification.isSupported()) {
          new Notification({
            title: 'Passcode Copied',
            body: `Passcode (${passcode}) copied to clipboard!`
          }).show();
        }
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
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
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
