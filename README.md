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
  - Secure 6-digit PIN authentication.
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
  - Native support for Cloudflare Quick Tunnels.
  - Support for permanent named tunnels (e.g., `https://mynas-hi.eu.org`), enabling global access without exposing your home IP.

## Architecture & Technology Stack

- **Backend**
  - **Server Framework:** Express
  - **Database:** SQLite (using `better-sqlite3`)
  - **Network Discovery:** mDNS via `bonjour-service`
  - **Remote Access:** Cloudflare Tunnels (`cloudflared`)

- **Web App**
  - **Structure:** HTML5
  - **Styling:** CSS3 Glassmorphism design system
  - **Logic:** Vanilla JS (`app.js`)

- **Mobile App**
  - **Framework:** React Native with Expo SDK 57
  - **Media:** `expo-image`, `expo-video`
  - **Security:** `expo-secure-store`
  - **Background Tasks:** `expo-task-manager`

## Quick Start Guide

### Server Installation & Run
```bash
cd server
npm install
node index.js
```

### Mobile App Run
```bash
cd mobile
npm install
npx expo start
```

## Remote Domain Setup (`mynas-hi.eu.org`)

Connect your free permanent domain using Cloudflare Zero Trust in 3 simple steps:

1. **Create a Cloudflare Tunnel:**
   Log into Cloudflare Zero Trust, navigate to Access > Tunnels, and create a new tunnel.
2. **Install Cloudflared:**
   Install the `cloudflared` daemon on your host machine and authenticate it using the provided token.
3. **Route Traffic:**
   In the tunnel configuration, route a Public Hostname (e.g., `mynas-hi.eu.org`) to your local Express server (e.g., `http://localhost:3000`).

## Security & Privacy Architecture

- **Database Protection:** Comprehensive SQL Injection protection using prepared statements.
- **File System Security:** Path traversal sanitization to prevent unauthorized access.
- **Authentication:** bcrypt password hashing and 6-digit PIN security.
- **Brute Force Prevention:** Auth rate limiting capped at 10 attempts per 15 minutes.
- **Data at Rest:** Encrypted local mobile storage using `expo-secure-store`.
