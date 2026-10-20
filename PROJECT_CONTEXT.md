# Personal NAS — Project Context

## 1. Project Overview & Purpose
A self-hosted, enterprise-grade Personal NAS ecosystem providing unified private cloud storage, media gallery management, and automated background device camera roll backups. It features a Node.js Express server backend with SQLite database persistence, an Apple Liquid Glass web dashboard for desktop management, and a React Native Expo mobile application for Android & iOS.

## 2. Architecture Diagram & Tech Stack
- **Backend:** Node.js, Express, SQLite (`better-sqlite3`), mDNS (`bonjour-service`), Cloudflare Tunnels (`cloudflared`), `sharp` image processing.
- **Web Frontend:** HTML5, CSS3 (Apple Frosted Glassmorphism, floating window architecture, 3-layer radial mesh, dynamic light/dark theme system), Vanilla JS (`app.js`).
- **Mobile App:** React Native, Expo SDK 52, `expo-image`, `expo-video`, `expo-media-library`, `expo-device`, `expo-secure-store`, `expo-task-manager`, `FlashList` by Shopify.

## 3. Key Features & Capability Matrix
- **Web Dashboard & Desktop Shell:**
  - **First-Run 5-Step Windows Setup Wizard:** Comprehensive interactive wizard automatically launched on clean installations:
    1. **System Environment & Host Diagnostics**: Auto-detects host PC name, Windows x64 platform, local LAN IPv4 addresses, customizable NAS friendly name, and server port.
    2. **Storage Selection & Allocation**: Auto-detects Windows drives (C:, D:, E:), allocates dedicated storage directories (e.g. `D:\NAS_Storage` with auto-created subfolders `MobileUploads`, `NAS_Backup`, `Documents`, `Media`), and optional RAID 1 redundant mirroring.
    3. **Master Admin Account Setup**: Configures admin credentials and displays offline emergency recovery passcode with 1-click copy.
    4. **Remote Access & Connectivity**: Choose between Local LAN, Quick Tunnel (*.trycloudflare.com), or Cloudflare Zero Trust custom domain.
    5. **Setup Completion & Mobile QR Pairing**: Displays live QR code for instant 1-tap mobile auto-login and background photo sync.
  - **Electron Desktop Wrapper:** Native Windows shell with background System Tray integration, minimize-to-tray behavior, auto-start on boot (`openAtLogin`), and automatic Windows Firewall rule creation (`PersonalNAS_HTTP` TCP 3000).
  - **Data Persistence Routing:** Fully isolated in `%APPDATA%\PersonalNAS\` (`nas_data.db`, `.env`, `.nas_cache`, `.nas_trash`, `temp_uploads`, and `tunnel_config.json`) for seamless UWP/MSIX compliance.
  - 6-Digit PIN passcode & user account authentication with bcrypt hashing.
  - Granular User Access Control: Per-user allowed storage disks (e.g. `C:`, `G:`) and Read-Only / Read-Write permission flags.
  - Light / Dark Theme toggle with custom animated switch widget and ambient radial background lighting.
  - Registered NAS Users management panel with interactive circular arc storage gauges.
  - Cloudflare Permanent Named Tunnel configuration (`mynas-hi.online`) accessible to non-admin & admin users with bundled `cloudflared.exe`.
  - User-specific mobile pairing QR code embedding session JWT tokens for seamless 1-tap mobile auto-login.
  - Dual "Switch Account" and "Logout" actions in sidebar footer with instant credential refocus and state reset.
  - **Security & Multi-Tenant Containment:**
    - Canonical path resolution (`resolveSafeTarget`) blocking path traversal, relative parent escapes (`..`), alternate data streams (`:`), and Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
    - Storage isolation via `validatePath` preventing access to `.env`, `nas_data.db`, AppData, `%WINDIR%`, and enforcing drive boundary restrictions.
    - Token versioning with instant session revocation on password changes, admin permission adjustments, and `/api/auth/logout`.
    - Local offline pairing QR code generation via `qrcode` (no third-party API exposure) with single-use 5-minute OTP pairing codes.
    - Locked public registration by default (`ALLOW_PUBLIC_REGISTRATION=false`), with self-registered accounts quarantined (Read-Only, 0 disks allowed).
    - Trash ownership isolation preventing cross-user file viewing, restoration, or purging.
    - Strict CORS enforcement matching active Cloudflare tunnel domain, custom domain, or local RFC1918 subnets.
  - Generous 32px/28px breathing-room data tables with 2px card borders, squircle styling, and subtle hover rows for Admin Registered Users and Audit Logs.
  - Hidden plain-text passcode security across UI elements.
- **Mobile App:**
  - **TopBar Header:** Persistent top bar featuring the square `myNAS` logo on the left and live user badge (`👤 <username>`) on the right.
  - **Dynamic Theming:** Light and Dark theme modes powered by `ThemeContext`, persisting across app restarts.
  - **Seamless QR Scanner Auto-Login:** Scans web QR payload (`{ url, pairingCode }` or `{ url, token }`), redeems single-use pairing codes via `/api/pairing/redeem`, verifies identity via `/api/auth/verify`, and logs in with scoped user permissions.
  - **Camera Roll Backup Engine:** Multi-protocol background photo/video backup, SHA-256 deduplication, target directory validation (`/api/sync/validate-target`), 5MB chunked large-file uploads, and standard path formatting (`<Drive>\NAS_Backup\<DeviceName>\`).
  - **Media Gallery:** High-performance paginated media grid (`FlashList`), date grouping, format extension filter bar (`ALL`, `.JPG`, `.PNG`, `.WEBP`, `.MP4`, `.MKV`), long-press batch selection mode with **Select All / Deselect All**, and direct targeted NAS upload modal.
  - **Storage & Interactive Explorer:** Circular storage gauges and full Interactive NAS Disk File Explorer (`FileExplorerModal`).
  - **In-App OTA Update Checker & Installer:** Built-in update module under System Settings allowing users to check for new Over-The-Air app updates (`Updates.checkForUpdateAsync()`), download updates with live progress, and install/reload with 1 tap (`Updates.reloadAsync()`).
  - **Security & Network:** Biometric unlock (Fingerprint / Face ID), passcode fallback modal, custom Expo config plugin (`withCleartextTraffic.js`), and HTTPS tunnel failover for HTTP cleartext exceptions.

## 4. API Endpoint Reference
- `/api/auth`: Handles passcode verification, bcrypt user login, registration (`ALLOW_PUBLIC_REGISTRATION` gated), `/api/auth/verify` token validation, token version checking, `/api/auth/logout` session invalidation, and HTML-escaped email verification.
- `/api/pairing`: Secure pairing subsystem:
  - `POST /api/pairing/create`: Admin/user authenticated generation of a 5-minute single-use pairing code.
  - `GET /api/pairing/qr`: Generates local, offline Data URL QR code.
  - `POST /api/pairing/redeem`: Rate-limited single-use code exchange for scoped JWT session token.
- `/api/setup`: Server first-run onboarding status check (`/status`) and initial setup completion (`/complete`, blocked over public tunnels).
- `/api/drives`: Retrieves system storage and mounted drive information filtered by allowed paths and user disk permissions (`isPathAllowed`).
- `/api/files`: Serves file explorer endpoints for directory listing, search, moving, deletion, and batch zip downloading — all strictly contained within storage roots.
- `/api/upload`: Handles standard multipart and chunked (`/api/upload/chunk`) file/media uploads to specified destination paths, protected against path traversal.
- `/api/sync/validate-target`: Validates target NAS backup folders for writability and free disk space.
- `/api/gallery`: Serves paginated media items filtered by user disk access rules.
- `/api/users` & `/api/admin/users`: Manages registered users, creation, permissions updates, password resets, and account unlocking.
- `/api/trash`: Multi-tenant trash endpoints (`/list`, `/restore`, `/purge`) with per-user ownership enforcement.
- `/api/tunnel`: Manages Cloudflare Quick Tunnels and Permanent Named Tunnels (`/start`, `/stop`, `/configure-named`, `/status`).
- `/api/activity`: Serves recent activity logs with strict user isolation (regular users only receive their own activity, while admins see global activity with user attribution tags).
- `/api/admin/activity`: Admin-only endpoint serving the full security audit log with user attribution.
- `/api/system`: Serves server status, uptime, network IP addresses, and system info.

## 5. Database Schema (`nas_data.db`)
- **`users`**: Stores user ID, username, email, bcrypt password hash, role (`admin`/`user`), `is_readonly` flag, `allowed_disks` JSON array, `token_version` integer, email verification status, and timestamp.
- **`pairing_codes`**: Stores ephemeral single-use mobile pairing codes with user ID, username, role, expiration timestamp, and redeemed flag.
- **`trash_items`**: Stores trashed files with original path, trash path, deletion timestamp, size, and user `owner`.
- **`activity_logs`**: SQLite table storing `id`, `type`, `detail`, `username`, and `time` with indexed username and timestamp columns for fast, secure audit querying.
- **`sync_manifest`**: Keeps track of device ID, file hashes, filenames, file sizes, target NAS paths, and sync timestamps for deduplication.

## 6. Remote Access & Tunnels
- **Quick Tunnels:** Automatically generated `*.trycloudflare.com` URLs.
- **Permanent Named Tunnels:** Configured via Cloudflare Zero Trust to custom domains (`https://mynas-hi.online`) for persistent, secure remote access without port forwarding.

## 7. Development & Build Instructions
- **Code Graph & Technical Specification:** See [`CODE_GRAPH.md`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/CODE_GRAPH.md).
- **Windows Store Submission Guide:** See [`docs/WINDOWS_STORE_PUBLISHING.md`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/docs/WINDOWS_STORE_PUBLISHING.md).
- **Running Server Backend:** `cd server` -> `node index.js`.
- **Running Desktop Shell:** `cd server` -> `npm run desktop`.
- **Building Windows Standalone Installer (.exe):** `npm run build:exe`.
- **Building Microsoft Windows Store Package (.appx):** `npm run build:store`.
- **Building Both Windows Packages:** `npm run build:all`.
- **Mobile Development Server:** `cd mobile` -> `npx expo start`.
- **Building Android Standalone APK:** `cd mobile` -> `npx eas-cli build -p android --profile preview`.
- **Publishing Over-The-Air (OTA) Updates:** `cd mobile` -> `npx eas-cli update --branch main --environment production`.
