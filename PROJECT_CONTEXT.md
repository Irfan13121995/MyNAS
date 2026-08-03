# Personal NAS - Project Context

## 1. Project Overview & Purpose
A self-hosted Personal NAS solution providing a unified ecosystem for private storage, media gallery management, and automated device backups. It features a robust Node.js Express server backend, an Apple Dark Liquid Glass web dashboard for desktop management, and a seamless Expo React Native mobile app for on-the-go access.

## 2. Architecture Diagram & Tech Stack
- **Backend:** Node.js, Express, SQLite (`better-sqlite3`), mDNS (`bonjour-service`), Cloudflare Tunnels (`cloudflared`).
- **Web Frontend:** Vanilla HTML5, CSS3 (Apple Frosted Glassmorphism, 3-layer radial mesh, cyan glow accents), Vanilla JS (`app.js`).
- **Mobile App:** React Native, Expo SDK 57, `expo-image`, `expo-video`, `expo-device`, `expo-secure-store`, `expo-task-manager`.

## 3. Key Features & Capability Matrix
- **Web App:** 
  - 6-Digit PIN passcode entry
  - Registered NAS Users table
  - Storage management with Circular Arc Storage Gauges
  - Cloudflare Permanent Named Tunnel configuration (`mynas-hi.eu.org`)
  - Activity logs
- **Mobile App:** 
  - Auto-Sync engine (deduplication, device folder auto-naming `Mobile Backups\<DeviceName>\Photos`, background sync)
  - High-performance paginated media gallery with File Extension Filter Bar (`ALL`, `.JPG`, `.PNG`, `.WEBP`, `.MP4`, `.MKV`)
  - Disk Storage Circular Gauges
  - Full Interactive NAS Disk File Explorer (`FileExplorerModal`)
  - Biometric authentication

## 4. API Endpoint Reference
- `/api/auth`: Handles user authentication and session management.
- `/api/drives`: Retrieves system storage and mounted drive information.
- `/api/files`: Serves file explorer endpoints for directory listing, moving, and deletion.
- `/api/upload`: Handles file and media uploads from web and mobile clients.
- `/api/gallery`: Serves paginated media items for the mobile app gallery.
- `/api/users`: Manages registered users, creation, and deletion.
- `/api/tunnel`: Manages Cloudflare tunnel configuration and status.

## 5. Database Schema
The main SQLite database is `nas_data.db`.
- **`users`**: Stores registered user credentials, 6-digit PINs, and metadata.
- **`activity_logs`**: Tracks file access, uploads, logins, and system events.
- **`sync_manifest`**: Keeps track of synced files from mobile devices for deduplication and auto-sync management.

## 6. Remote Access & Tunnels
The system relies on Cloudflare Tunnels to provide secure remote access without port forwarding:
- **Quick Tunnels:** Automatically generated `*.trycloudflare.com` URLs for temporary development and testing.
- **Permanent Named Tunnels:** Configured via Cloudflare Zero Trust to a custom domain (e.g., `https://mynas-hi.eu.org`) for persistent, secure remote access.

## 7. Development & Build Instructions
- **Running Server:** Navigate to the `server/` directory and run `node index.js`.
- **Mobile App:** Navigate to the `mobile/` directory and run `npx expo start`.
- **Health Checks:** Run `npx expo-doctor` in the `mobile/` directory to verify dependencies and setup.
