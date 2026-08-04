# 🌐 Personal NAS — Private Self-Hosted Storage Ecosystem

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Expo SDK](https://img.shields.io/badge/Expo%20SDK-57-blue.svg)
![SQLite](https://img.shields.io/badge/SQLite-Database-blue.svg)
![Express](https://img.shields.io/badge/Express-Backend-black.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

## Executive Overview
The Personal NAS is a private, self-hosted cloud storage server designed as a zero-cost alternative to Google Drive, iCloud, and Synology. It provides a secure, reliable, and easily accessible way to store, manage, and sync your personal media and files without recurring subscription fees or privacy compromises.

## Core Features

- **Apple Dark Liquid Glass Dashboard**
  - Stunning UI featuring frosted glass cards (`backdrop-filter: blur(24px)`) and cyan glow accents.
  - Secure 6-digit PIN & account authentication.
  - Registered users management interface.
  - Interactive circular storage gauges for real-time capacity monitoring.

- **Android Mobile App**
  - **Auto-Sync:** Real photo & video auto-sync with SHA-256 deduplication.
  - **Smart Organization:** Device-based folder organization (`Mobile Backups\<DeviceName>\Photos`).
  - **Media Gallery:** Paginated media gallery with a File Extension Filter Bar (`ALL`, `.JPG`, `.PNG`, `.WEBP`, `.MP4`, `.MKV`).
  - **Viewer:** Hardware-accelerated image viewer for maximum performance.
  - **Dashboard:** Pure React Native circular storage gauges.
  - **Explorer:** Interactive NAS disk file explorer (`FileExplorerModal`).

- **Zero-Cost Remote Access**
  - Native support for Cloudflare Quick Tunnels (`*.trycloudflare.com`).
  - Support for permanent named custom domains (e.g., `https://mynas-hi.online`), enabling global access without exposing your home IP.

## Architecture & Technology Stack

- **Backend:** Express, SQLite (`better-sqlite3`), mDNS (`bonjour-service`), Cloudflare Tunnels (`cloudflared`).
- **Web App:** HTML5, CSS3 Glassmorphism design system, Vanilla JS (`app.js`).
- **Mobile App:** React Native, Expo SDK 57, `expo-image`, `expo-video`, `expo-secure-store`, `expo-task-manager`.

---

## 💻 Deployment & Installation Guide (Windows 10 / 11)

Follow these steps to set up the **Personal NAS** web app server on any Windows 10 / Windows 11 machine.

### Prerequisites
- **Windows 11** or **Windows 10** (64-bit).
- **Administrator Privileges** on the host machine.
- *(Optional)* Free [Cloudflare](https://dash.cloudflare.com) account for custom domains (`https://mynas-hi.online`).

---

### 🚀 Method 1: Automated Windows Service Setup (Recommended)

An automated PowerShell installer is provided in the repository under `installer/scripts/install-service.ps1`.

#### 1. Clone or Download Codebase
Open PowerShell and clone the repository into your preferred folder:
```powershell
git clone https://github.com/Irfan13121995/MyNAS.git C:\PersonalNAS
```

#### 2. Run PowerShell Installer as Administrator
Open **PowerShell as Administrator** (Right-click PowerShell ➔ *Run as administrator*) and execute:
```powershell
cd C:\PersonalNAS\installer\scripts
.\install-service.ps1 -Port 3000 -StoragePath "C:\NAS_Storage"
```

> [!NOTE]
> **What the script handles automatically:**
> - Checks for **Node.js (v18+)** and automatically downloads & installs it silently if missing.
> - Runs `npm install` for Express, SQLite (`better-sqlite3`), and server dependencies.
> - Creates Windows Firewall rules for HTTP (port 3000) and mDNS local network discovery (UDP port 5353).
> - Auto-generates a secure random `JWT_SECRET` and 6-digit `PASSCODE` inside `server/.env`.
> - Configures and starts **PersonalNAS_Server** as a background Windows Service (auto-starts on Windows boot via NSSM).

---

### 🛠️ Method 2: Manual Developer Setup

If you prefer running the server manually via command line:

#### 1. Install Node.js
Download and install **Node.js v24 LTS** (or v18+) from [nodejs.org](https://nodejs.org).

#### 2. Clone & Install Dependencies
```powershell
git clone https://github.com/Irfan13121995/MyNAS.git
cd MyNAS/server
npm install
```

#### 3. Create Environment File (`server/.env`)
Create a file named `.env` inside the `server/` directory:
```env
PORT=3000
JWT_SECRET=your_random_32_byte_secret_here
PASSCODE=123456
REQUIRE_EMAIL_VERIFICATION=false
```

#### 4. Launch Server
```powershell
node index.js
```

You will see:
```text
✅ Server is running at http://0.0.0.0:3000
====================================
  Personal NAS Server Active Passcode: 123456
  Dashboard: http://localhost:3000
====================================
```

---

## 🌐 Remote Access & Custom Domain Setup (`mynas-hi.online`)

To connect your custom domain to your Personal NAS server:

1. Open your browser on the server machine: `http://localhost:3000`.
2. Log in with your 6-digit passcode.
3. Navigate to **Remote Access**:
   - Paste your **Cloudflare Zero Trust Tunnel Token** (`eyJh...`).
   - Set **Custom Public Domain URL**: `https://mynas-hi.online`.
   - Click **Save & Connect**.
4. In Cloudflare DNS, ensure a `CNAME` record points `@` to your Cloudflare Tunnel target ID.

---

## 📱 Mobile App Setup (Android)

1. **Run App locally**:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
2. **Pairing**:
   - **Local Wi-Fi:** Enter your PC's LAN IP (e.g. `192.168.1.50`) and port `3000`.
   - **Remote Access:** Tap **Remote Access** tab, paste `https://mynas-hi.online` (or Quick Tunnel URL), enter your passcode, and tap **Connect**.

---

## Security & Privacy Architecture

- **Database Protection:** Comprehensive SQL Injection protection using prepared statements.
- **File System Security:** Path traversal sanitization to prevent unauthorized access.
- **Authentication:** bcrypt password hashing and 6-digit PIN security.
- **Brute Force Prevention:** Auth rate limiting capped at 10 attempts per 15 minutes.
- **Data at Rest:** Encrypted local mobile storage using `expo-secure-store`.
