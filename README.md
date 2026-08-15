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

## 💻 Deployment & Installation Guide (Windows 10 / 11)

### Prerequisites
- **Windows 11** or **Windows 10** (64-bit).
- **Administrator Privileges** on host machine.
- *(Optional)* Free [Cloudflare](https://dash.cloudflare.com) account for custom domains (`https://mynas-hi.online`).

---

### 🚀 Method 1: Automated Windows Service Setup (Recommended)

An automated PowerShell installer is provided in `installer/scripts/install-service.ps1`.

#### 1. Clone Codebase
```powershell
git clone https://github.com/Irfan13121995/MyNAS.git C:\PersonalNAS
```

#### 2. Run PowerShell Installer as Administrator
Open **PowerShell as Administrator** and execute:
```powershell
cd C:\PersonalNAS\installer\scripts
.\install-service.ps1 -Port 3000 -StoragePath "C:\NAS_Storage"
```

> [!NOTE]
> **Automated Setup Highlights:**
> - Auto-detects and installs **Node.js (v18+)** silently if missing.
> - Installs server dependencies and compiles native SQLite binaries.
> - Creates Windows Firewall rules for HTTP (port 3000) and mDNS (UDP port 5353).
> - Auto-generates secure random `JWT_SECRET` and bcrypt passcode hash in `server/.env`.
> - Registers and starts **PersonalNAS_Server** as a background Windows Service via NSSM.

---

### 🛠️ Method 2: Manual Developer Setup

#### 1. Install Node.js
Download and install **Node.js LTS (v18+)** from [nodejs.org](https://nodejs.org).

#### 2. Clone & Install Dependencies
```powershell
git clone https://github.com/Irfan13121995/MyNAS.git
cd MyNAS/server
npm install
```

#### 3. Create Environment File (`server/.env`)
```env
PORT=3000
JWT_SECRET=your_random_32_byte_secret_here
PASSCODE_HASH=$2b$10$0gh72kIzztqOGHfL/JrFYesmp9xU/PQSykIVDKTvKW12xHo7gRYue
REQUIRE_EMAIL_VERIFICATION=false
```

#### 4. Launch Server
```powershell
node index.js
```

---

## 🌐 Remote Access & Custom Domain Setup (`mynas-hi.online`)

1. Open dashboard at `http://localhost:3000`.
2. Log in with your passcode or user credentials.
3. Navigate to **Remote Access**:
   - Enter your **Cloudflare Zero Trust Tunnel Token**.
   - Enter **Custom Public Domain URL**: `https://mynas-hi.online`.
   - Click **Save & Connect**.
4. In Cloudflare DNS, ensure a `CNAME` record points `@` to your tunnel target domain.

---

## 📱 Mobile App Setup (Android & iOS)

1. **Run App Locally**:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
2. **Pairing**:
   - **QR Code Scan:** Tap **📷 QR Scan** on the connection screen and scan the pairing QR code on the Web Dashboard to instantly pair and auto-login as that user.
   - **Local Wi-Fi:** Enter host IP (e.g. `10.31.30.50`) and port `3000`.
   - **Remote Access:** Enter `https://mynas-hi.online` and your user credentials.
3. **Build Standalone Android APK**:
   ```bash
   cd mobile
   npx eas-cli build --platform android --profile preview
   ```
4. **Publish OTA Updates**:
   ```bash
   cd mobile
   npx eas-cli update --branch main --environment production
   ```

---

## 🛡️ Security Architecture

- **Path Normalization & Traversal Defense:** Drive letter and target path canonicalization (`C:` -> `C:\`) preventing path traversal attacks.
- **Disk-Level User Isolation:** Strict per-user drive filter (`allowedDisks`) applied at API layer across drives, file lists, media gallery, and uploads.
- **Read-Only Enforcements:** Non-destructive HTTP 403 responses preserving user authentication state.
- **Authentication:** bcrypt password hashing for user accounts and 6-digit bcrypt passcode hashing.
- **Rate Limiting:** Auth rate limiter capped at 10 login attempts per 15 minutes.
- **Secure Native Storage:** Mobile credentials encrypted via `expo-secure-store`.
