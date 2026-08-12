# Personal NAS — Project Context

## 1. Project Overview & Purpose
A self-hosted, enterprise-grade Personal NAS ecosystem providing unified private cloud storage, media gallery management, and automated background device camera roll backups. It features a Node.js Express server backend with SQLite database persistence, an Apple Liquid Glass web dashboard for desktop management, and a React Native Expo mobile application for Android & iOS.

## 2. Architecture Diagram & Tech Stack
- **Backend:** Node.js, Express, SQLite (`better-sqlite3`), mDNS (`bonjour-service`), Cloudflare Tunnels (`cloudflared`), `sharp` image processing.
- **Web Frontend:** HTML5, CSS3 (Apple Frosted Glassmorphism, floating window architecture, 3-layer radial mesh, dynamic light/dark theme system), Vanilla JS (`app.js`).
- **Mobile App:** React Native, Expo SDK 52, `expo-image`, `expo-video`, `expo-media-library`, `expo-device`, `expo-secure-store`, `expo-task-manager`, `FlashList` by Shopify.

## 3. Key Features & Capability Matrix
- **Web Dashboard:**
  - 6-Digit PIN passcode & user account authentication with bcrypt hashing.
  - Granular User Access Control: Per-user allowed storage disks (e.g. `C:`, `G:`) and Read-Only / Read-Write permission flags.
  - Light / Dark Theme toggle with custom animated switch widget and ambient radial background lighting.
  - Registered NAS Users management panel with interactive circular arc storage gauges.
  - Cloudflare Permanent Named Tunnel configuration (`mynas-hi.online`) accessible to non-admin & admin users.
  - User-specific mobile pairing QR code embedding session JWT tokens for seamless 1-tap mobile auto-login.
  - Hidden plain-text passcode security across UI elements.
- **Mobile App:**
  - **TopBar Header:** Persistent top bar featuring the square `myNAS` logo on the left and live user badge (`👤 <username>`) on the right.
  - **Dynamic Theming:** Light and Dark theme modes powered by `ThemeContext`, persisting across app restarts.
  - **Seamless QR Scanner Auto-Login:** Scans web QR payload (`{ url, token }`), verifies identity via `/api/auth/verify`, and logs in as that exact user with appropriate disk permissions.
  - **Camera Roll Backup Engine:** Multi-protocol background photo/video backup, SHA-256 deduplication, target directory validation (`/api/sync/validate-target`), 5MB chunked large-file uploads, and standard path formatting (`<Drive>\NAS_Backup\<DeviceName>\`).
  - **Media Gallery:** High-performance paginated media grid (`FlashList`), date grouping, format extension filter bar (`ALL`, `.JPG`, `.PNG`, `.WEBP`, `.MP4`, `.MKV`), long-press batch selection mode with **Select All / Deselect All**, and direct targeted NAS upload modal.
  - **Storage & Interactive Explorer:** Circular storage gauges and full Interactive NAS Disk File Explorer (`FileExplorerModal`).
  - **Security & Network:** Biometric unlock (Fingerprint / Face ID), passcode fallback modal, custom Expo config plugin (`withCleartextTraffic.js`), and HTTPS tunnel failover for HTTP cleartext exceptions.

## 4. API Endpoint Reference
- `/api/auth`: Handles passcode verification, bcrypt user login, registration, `/api/auth/verify` token validation, and email verification.
- `/api/drives`: Retrieves system storage and mounted drive information filtered by allowed paths and user disk permissions (`isPathAllowed`).
- `/api/files`: Serves file explorer endpoints for directory listing, search, moving, deletion, and batch zip downloading.
- `/api/upload`: Handles standard multipart and chunked (`/api/upload/chunk`) file/media uploads to specified destination paths.
- `/api/sync/validate-target`: Validates target NAS backup folders for writability and free disk space.
- `/api/gallery`: Serves paginated media items filtered by user disk access rules.
- `/api/users` & `/api/admin/users`: Manages registered users, creation, permissions updates, password resets, and account unlocking.
- `/api/tunnel`: Manages Cloudflare Quick Tunnels and Permanent Named Tunnels (`/start`, `/stop`, `/configure-named`, `/status`).
- `/api/system`: Serves server status, uptime, network IP addresses, and system info.

## 5. Database Schema (`nas_data.db`)
- **`users`**: Stores user ID, username, email, bcrypt password hash, role (`admin`/`user`), `is_readonly` flag, `allowed_disks` JSON array, email verification status, and timestamp.
- **`activity_logs`**: Tracks file access, uploads, logins, administrative changes, and system events.
- **`sync_manifest`**: Keeps track of device ID, file hashes, filenames, file sizes, target NAS paths, and sync timestamps for deduplication.

## 6. Remote Access & Tunnels
- **Quick Tunnels:** Automatically generated `*.trycloudflare.com` URLs.
- **Permanent Named Tunnels:** Configured via Cloudflare Zero Trust to custom domains (`https://mynas-hi.online`) for persistent, secure remote access without port forwarding.

## 7. Development & Build Instructions
- **Code Graph & Technical Specification:** See [`CODE_GRAPH.md`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/CODE_GRAPH.md).
- **Running Server Backend:** `cd server` -> `node index.js`.
- **Mobile Development Server:** `cd mobile` -> `npx expo start`.
- **Building Android Standalone APK:** `cd mobile` -> `npx eas-cli build -p android --profile preview`.
- **Publishing Over-The-Air (OTA) Updates:** `cd mobile` -> `npx eas-cli update --branch main --environment production`.
