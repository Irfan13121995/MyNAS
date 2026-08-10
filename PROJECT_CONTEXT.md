# Personal NAS - Project Context

## 1. Project Overview & Purpose
A self-hosted Personal NAS solution providing a unified ecosystem for private cloud storage, media gallery management, and automated background device backups. It features a robust Node.js Express server backend, an Apple Liquid Glass web dashboard for desktop management, and a feature-complete Expo React Native mobile application for Android & iOS.

## 2. Architecture Diagram & Tech Stack
- **Backend:** Node.js, Express, SQLite (`better-sqlite3`), mDNS (`bonjour-service`), Cloudflare Tunnels (`cloudflared`).
- **Web Frontend:** Vanilla HTML5, CSS3 (Apple Frosted Glassmorphism, 3-layer radial mesh, dynamic light/dark theme system), Vanilla JS (`app.js`).
- **Mobile App:** React Native, Expo SDK 57, `expo-image`, `expo-video`, `expo-device`, `expo-secure-store`, `expo-task-manager`, `FlashList` by Shopify.

## 3. Key Features & Capability Matrix
- **Web App:** 
  - 6-Digit PIN passcode entry & bcrypt user account authentication
  - Light / Dark Theme toggle with custom animated switch widget
  - Registered NAS Users table & storage management with Circular Arc Storage Gauges
  - Cloudflare Permanent Named Tunnel configuration (`mynas-hi.online` / `mynas-hi.eu.org`)
  - Auto-generated mobile pairing QR codes with embedded server URL and passcode
  - System activity logging and live bandwidth metrics
- **Mobile App:**
  - **Dynamic Theming:** Comprehensive Light and Dark theme modes powered by `ThemeContext`, persisting across app restarts.
  - **Auto-Sync Engine:** Multi-protocol background photo/video backup, SHA-256 deduplication, target directory validation (`/api/sync/validate-target`), 5MB chunked large-file uploads, and device folder auto-naming (`Mobile Backups\<DeviceName>\Photos`).
  - **Media Gallery & Multiselect:** High-performance paginated media grid (`FlashList`), extension filter bar (`ALL`, `.JPG`, `.PNG`, `.WEBP`, `.MP4`, `.MKV`), long-press batch selection mode with **Select All / Deselect All**, visual checkmark overlays, and action buttons.
  - **Storage & Interactive Explorer:** Pure React Native circular storage gauges and full Interactive NAS Disk File Explorer (`FileExplorerModal`).
  - **Authentication & Security:** Biometric unlock (Fingerprint / Face ID), passcode fallback modal, and zero-touch QR scanner pairing.

## 4. API Endpoint Reference
- `/api/auth`: Handles 6-digit passcode verification, bcrypt user login, registration, and email verification.
- `/api/drives`: Retrieves system storage and mounted drive information (in-memory 5s TTL cached).
- `/api/files`: Serves file explorer endpoints for directory listing, search, moving, deletion, and batch zip downloading.
- `/api/upload`: Handles standard and chunked (`/api/upload/chunk`) file/media uploads from web and mobile clients.
- `/api/sync/validate-target`: Validates target NAS backup folders for writability and free disk space.
- `/api/gallery`: Serves paginated media items for the mobile app gallery with deduplicated cache rebuilds.
- `/api/users`: Manages registered users, creation, email verification, and deletion.
- `/api/tunnel`: Manages Cloudflare Quick Tunnels and Permanent Named Tunnels.
- `/api/system`: Serves server status, uptime, network IP addresses, and active passcode.

## 5. Database Schema
The main SQLite database is `nas_data.db`.
- **`users`**: Stores registered user credentials, bcrypt password hashes, email verification tokens, and metadata.
- **`activity_logs`**: Tracks file access, uploads, logins, and system events.
- **`sync_manifest`**: Keeps track of synced files from mobile devices for deduplication and auto-sync state management.

## 6. Remote Access & Tunnels
The system relies on Cloudflare Tunnels to provide secure remote access without port forwarding:
- **Quick Tunnels:** Automatically generated `*.trycloudflare.com` URLs for temporary testing.
- **Permanent Named Tunnels:** Configured via Cloudflare Zero Trust to custom domains (`https://mynas-hi.online` / `https://mynas-hi.eu.org`) for persistent, secure remote access.

## 7. Development & Build Instructions
- **Running Server:** Navigate to `server/` and run `node index.js`.
- **Mobile App:** Navigate to `mobile/` and run `npx expo start`.
- **Building Android APK:** Run `npx eas-cli build --platform android --profile preview` in `mobile/`.
- **Publishing OTA Updates:** Run `npx eas-cli update --branch preview --environment preview` in `mobile/`.
- **Health Checks:** Run `npx expo-doctor` in `mobile/` to verify dependencies.
