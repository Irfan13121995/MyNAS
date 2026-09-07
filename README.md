# 🌐 Personal NAS — Private Self-Hosted Storage Ecosystem

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Expo SDK](https://img.shields.io/badge/Expo%20SDK-52-blue.svg)
![SQLite](https://img.shields.io/badge/SQLite-Database-blue.svg)
![Express](https://img.shields.io/badge/Express-Backend-black.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

## Executive Overview
The **Personal NAS** is a private, self-hosted cloud storage and media server designed as a zero-cost, privacy-first alternative to Google Drive, iCloud, and Synology. It provides a secure, reliable, and high-performance ecosystem to store, stream, manage, and sync your personal media and files across desktop browsers and Android/iOS mobile devices without subscription fees.

---

## 🌟 Core Features & Capability Matrix

### 1. 🎨 Modern Apple Liquid Glass Web Dashboard
- **Floating Window Architecture:** Detached floating sidebar dock (`border-radius: 28px`), floating topbar header, and frosted glass cards (`backdrop-filter: blur(24px)`).
- **Ambient Lighting:** Multi-layered radial gradient background lighting orbs with dynamic Light and Dark theme modes.
- **Granular User & Disk Access Management:** Admin panel to manage users, assign per-user allowed storage disks (e.g. `C:`, `G:`), and enforce read-only vs. read-write permissions.
- **Multi-File & Complete Folder Uploads:** Interactive Apple Liquid Glass drag-and-drop upload zone supporting simultaneous multi-file selection, full recursive folder uploads with directory hierarchy preservation (`webkitdirectory` / DirectoryReader), live item staging preview, and high-speed parallel uploads with progress tracking.
- **Passcode Privacy:** Zero plain-text passcode exposure across the UI with encrypted security status pills.
- **Cropped 1:1 Brand Logo:** Modernized square logo presentation across Web Dashboard and Mobile App.

### 2. 📱 Android & iOS Mobile App
- **Persistent TopBar Header:** Features the `myNAS` logo on the left and a live user badge (`👤 <username>`) on the right.
- **Seamless QR Code Auto-Login:** Scan the Web Dashboard pairing QR code to instantly pair and auto-login as the user who generated the QR code, applying their exact disk permissions.
- **Phone Media Gallery:** Date-grouped phone photo & video gallery powered by `FlashList` with album filtering and multi-select sync.
- **Camera Roll Backup Center:** High-performance backup engine supporting SHA-256 deduplication, incremental sync, 5MB chunked uploads for large files, and standard path formatting (`<Drive>\NAS_Backup\<DeviceName>\`).
- **Interactive Disk Explorer:** Browse and manage files across mounted NAS drives with `FileExplorerModal`.
- **In-App OTA Update Checker & Installer:** Built-in update module in System Settings allowing users to check for new Over-The-Air app updates (`Updates.checkForUpdateAsync()`), download updates with live progress, and install/reload with 1 tap (`Updates.reloadAsync()`).
- **Security & Biometrics:** Biometric unlock (Fingerprint / Face ID), passcode fallback PIN, and encrypted credentials storage via `expo-secure-store`.
- **Cleartext Traffic Support:** Custom Expo config plugin (`withCleartextTraffic.js`) and HTTPS tunnel failover for smooth HTTP/HTTPS connectivity on Android 9-14.

### 3. 🌐 Zero-Cost Remote Access & Cloudflare Tunnels
- **Quick Tunnels:** Instant temporary remote URLs (`*.trycloudflare.com`).
- **Permanent Named Custom Domains:** Full support for custom domains (e.g. `https://mynas-hi.online`), allowing non-admin and admin users to start/stop tunnels and access data anywhere without opening home router ports.

---

## 🏗️ Architecture & Technology Stack

- **Backend:** Express, SQLite (`better-sqlite3`), mDNS (`bonjour-service`), Cloudflare Tunnels (`cloudflared`), `sharp` image processing.
- **Web App:** HTML5, Vanilla CSS3 Liquid Glassmorphism design system, Vanilla JS SPA (`app.js`).
- **Mobile App:** React Native, Expo SDK 52, `expo-image`, `expo-video`, `expo-media-library`, `expo-secure-store`, `expo-task-manager`, `@shopify/flash-list`.

---

## 💻 Server Installation & Quick Start Guide

Personal NAS can be deployed on any PC running **Windows 10 / 11** (or macOS / Linux).

### 📋 Prerequisites
- **Node.js LTS (v18, v20, or v22)** installed.  
  👉 Download the installer from [nodejs.org](https://nodejs.org) if you haven't already. (Select **LTS**).
- **Git** installed ([git-scm.com](https://git-scm.com)).

---

### 🚀 Method 1: 1-Click Quick Start for Windows (Easiest)

We provide a built-in startup script `start-server.bat` that automatically verifies Node.js, installs dependencies, initializes `.env`, launches the server, and opens your browser.

1. **Clone the repository**:
   ```cmd
   git clone https://github.com/Irfan13121995/MyNAS.git
   cd MyNAS
   ```

2. **Launch the Server**:
   Double-click `start-server.bat` in File Explorer, or run in your terminal:
   ```cmd
   start-server.bat
   ```

3. **That's it!**
   The script will install any missing dependencies, generate your secure `.env` file, start the server on port `3000`, and automatically open `http://localhost:3000` in your browser.

---

### 🛠️ Method 2: Standard Command-Line Setup (Cross-Platform)

If you prefer using the terminal (PowerShell, Command Prompt, or Terminal on Linux/Mac):

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Irfan13121995/MyNAS.git
   cd MyNAS
   ```

2. **Install Server Dependencies**:
   ```bash
   cd server
   npm install
   ```

3. **Configure Environment File** *(Optional - auto-generated if omitted)*:
   If you want to set your own port or passcode before launching:
   ```bash
   # On Windows PowerShell:
   Copy-Item .env.example .env

   # On Linux/macOS or CMD:
   copy .env.example .env
   ```
   *(If you skip this step, the server will automatically generate a fresh `.env` on first startup with a random JWT secret and passcode).*

4. **Start the Server**:
   ```bash
   npm start
   ```
   *(or run `node index.js`)*

5. **Open Dashboard**:
   Navigate to `http://localhost:3000` in any web browser.

---

### ⚙️ Method 3: Automated Windows Service (Runs in Background on PC Boot)

If you want Personal NAS to run permanently in the background as a Windows Service (starting automatically whenever your computer turns on without needing a terminal open):

1. **Open PowerShell as Administrator**:
   Right-click the Windows Start menu button and choose **Terminal (Admin)** or **Windows PowerShell (Admin)**.

2. **Navigate to the scripts folder and run**:
   ```powershell
   cd C:\Path\To\MyNAS\installer\scripts
   .\install-service.ps1
   ```
   *(You can also specify custom parameters if desired, e.g.: `.\install-service.ps1 -Port 3000 -StoragePath "D:\NAS_Storage"`)*.

> [!TIP]
> **What the Service Installer does automatically:**
> - Verifies Node.js (and silently installs Node.js LTS if missing).
> - Installs all production dependencies (`npm install --omit=dev`).
> - Downloads the background service wrapper (`nssm.exe`) if not present.
> - Creates your Windows Firewall rules for HTTP (port 3000) and LAN mDNS discovery.
> - Configures and starts the **PersonalNAS_Server** Windows service.
> - To uninstall the service at any time: run `.\uninstall-service.ps1` as Administrator.

---

## 🔑 First-Time Login & Admin Account Setup

When you open `http://localhost:3000` for the first time, you have two ways to log in:

### Option A: Register an Admin Account (Recommended)
1. On the login page, click **"Create an Account"** (or switch to the Register tab).
2. Enter your desired **Username**, **Email**, and **Password**.
3. Click **Register**.
4. **The very first account registered on Personal NAS is automatically granted full Administrator privileges** with zero email verification barriers! You can immediately manage users, storage disks, RAID pools, and system settings.

### Option B: Quick Passcode Login
1. When the server starts for the first time, check your terminal output or open `server/.env`.
2. Look for the line:
   ```env
   PASSCODE=123456
   ```
3. Enter that 6-digit passcode on the dashboard login screen to instantly log in as the Master Admin.

---

## 📡 Accessing Personal NAS from Other PCs & Phones on your Home Wi-Fi

1. **Find your Server's Local IP**:
   When you run `npm start` or `start-server.bat`, the terminal displays your network address, for example:
   ```
   📡 Network (LAN): http://192.168.1.105:3000
   ```
2. **Access from any device**:
   On your phone, laptop, tablet, or another PC connected to the same Wi-Fi network, open a web browser and type:
   `http://192.168.1.105:3000` *(replace with your host PC's IP)*.
3. **Windows Firewall Note**:
   If other devices cannot connect, ensure Windows Firewall permits inbound connections on Port 3000. You can allow it by running this one-line PowerShell command as Administrator:
   ```powershell
   New-NetFirewallRule -DisplayName "PersonalNAS_HTTP" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
   ```

---

## 🌐 Remote Access Anywhere & Custom Domain (`mynas-hi.online`)

Personal NAS includes native zero-configuration Cloudflare Tunnel support so you can securely access your files from anywhere in the world without exposing router ports:

1. Open your dashboard at `http://localhost:3000`.
2. Navigate to **System Settings ⚙️ $\rightarrow$ Remote Access**.
3. Enter your **Cloudflare Tunnel Token** and your custom domain (e.g. `https://mynas-hi.online`).
4. Click **Save & Connect**.
5. Your NAS is now globally reachable via HTTPS at `https://mynas-hi.online`!

---

## 📱 Mobile App (Android & iOS)

### 📲 Direct Android APK Download
Download the latest standalone Android APK directly to your phone:
- **Latest Standalone APK (v1.2.6)**: [Download Personal NAS Android APK](https://expo.dev/artifacts/eas/t3F4Hf8LClf1QFPmhtJJxMmEQGStSVaCbK90f_H7yM0.apk)

### 🔗 Pairing Your Phone to the Server
1. Open the Personal NAS app on your phone.
2. Log in using your credentials and server URL (`http://<YOUR_LAN_IP>:3000` or `https://mynas-hi.online`).
3. **Instant QR Pairing**: In the Web Dashboard, open the top-right profile menu, click **Pair Mobile App**, and scan the displayed QR code with your phone camera to pair and log in instantly.

### 💻 Running the Mobile Project Locally
```bash
cd mobile
npm install
npx expo start
```

---

## ❓ Frequently Asked Questions & Troubleshooting

#### 1. `'node'` or `'npm'` is not recognized as an internal or external command
You need to install Node.js. Download and install **Node.js LTS** from [nodejs.org](https://nodejs.org). Make sure to check the box "Add to PATH" during installation, then close and reopen your terminal.

#### 2. `Error: listen EADDRINUSE: address already in use :::3000`
Another program (or an existing instance of Personal NAS) is already using port 3000.  
- Change the port in `server/.env` to `PORT=3001` or another free port.
- Or close the existing process using port 3000.

#### 3. How do I change or reset my Master Passcode?
Open `server/.env` in Notepad. Edit `PASSCODE=your_new_passcode` (and delete the `PASSCODE_HASH` line if present). Restart the server; it will automatically rehash and apply your new passcode.

#### 4. How do I add or manage storage disks on the server?
Log into the Web Dashboard as an Administrator, navigate to **Storage Pools / Disks**, and click **Add Storage Disk** or **Create RAID 1 Mirror Pool**. You can assign specific disks or folders to specific users.

---

## 🛡️ Security Architecture

- **Path Normalization & Traversal Defense:** Drive letter and target path canonicalization (`C:` -> `C:\`) preventing path traversal attacks.
- **Disk-Level User Isolation:** Strict per-user drive filter (`allowedDisks`) applied at API layer across drives, file lists, media gallery, and uploads.
- **Read-Only Enforcements:** Non-destructive HTTP 403 responses preserving user authentication state.
- **Authentication:** bcrypt password hashing for user accounts and 6-digit bcrypt passcode hashing.
- **Rate Limiting:** Auth rate limiter capped at 10 login attempts per 15 minutes.
- **Secure Native Storage:** Mobile credentials encrypted via `expo-secure-store`.

