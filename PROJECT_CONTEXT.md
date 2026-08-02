# Personal NAS — Complete AI System & Codebase Architecture Context

> **Target Audience**: AI Coding Assistants / Engineers / Maintainers  
> **Purpose**: Serves as a single source of truth explaining the system architecture, component contracts, database schemas, API routes, mobile design tokens, security mechanisms, and platform edge cases for Personal NAS.

---

## 📌 1. Project Executive Overview

**Personal NAS** is an enterprise-grade, self-hosted Personal Network Attached Storage (NAS) solution consisting of:
1. **Node.js Express Backend Engine (`server/`)**: Local storage orchestration, SQLite database, sharp thumbnail caching, file streaming, auto-discovery (mDNS Bonjour), Cloudflare Tunnel remote access, and Recycle Bin file protection.
2. **Web Dashboard (`server/public/`)**: Single-Page Application (SPA) built with Vanilla JavaScript, HTML5, and custom Midnight CSS tokens. Features Drag & Drop uploader, drive management, media gallery with folder minimization, and file browser.
3. **Android & iOS Mobile Application (`mobile/`)**: Cross-platform mobile app built with React Native and Expo SDK 57. Uses Apple-inspired **Dark Liquid Glass design**, Google Photos-style media viewer with multi-touch pinch-to-zoom (1x–5x), double-tap zoom, horizontal photo swiping, photo editing, biometric Face ID/Fingerprint unlock, and hardware-backed KeyStore encryption.

---

## 🗂️ 2. Repository Directory Structure

```
personal-nas/
├── PROJECT_CONTEXT.md              # THIS FILE — Master AI Context Reference
├── .gitignore                      # Excludes secrets, node_modules, .nas_cache, .nas_trash, users.json
│
├── server/                         # NODE.JS BACKEND & WEB DASHBOARD
│   ├── index.js                    # Primary Express entry point, middleware, routes, mDNS
│   ├── dbService.js                # Embedded SQLite database (nas_data.db) with WAL mode
│   ├── usersService.js             # User authentication adapter for dbService (bcrypt 10 salt rounds)
│   ├── fileService.js              # Directory browser, media scanner, path validation & traversal security
│   ├── driveService.js             # Windows / Linux drive detection (wmic / df)
│   ├── driveConfigService.js       # Allowed NAS storage drives configuration
│   ├── thumbnailService.js         # Sharp 250px WebP thumbnail generator & disk cache (.nas_cache/thumbnails)
│   ├── trashService.js             # NAS Recycle Bin manager (.nas_trash) with restore & purge
│   ├── streamService.js            # HTTP Range video/audio chunk streaming with 206 Partial Content
│   ├── tunnelService.js            # Cloudflare Tunnel integration (cloudflared wrapper)
│   ├── emailService.js             # Nodemailer SMTP service for email verification
│   ├── ecosystem.config.js         # PM2 production process configuration
│   ├── .env                        # Runtime secrets (PORT, JWT_SECRET, PASSCODE) [Not in Git]
│   └── public/                     # WEB DASHBOARD SPA (Vanilla JS + CSS)
│       ├── index.html              # Web App shell with cache-busted assets
│       ├── app.js                  # SPA Router, state management, drag & drop uploader, media gallery
│       └── style.css               # Midnight Dark liquid glass UI tokens & animations
│
└── mobile/                         # REACT NATIVE EXPO MOBILE APP
    ├── App.js                      # Root component, authentication bootstrap, modal overlay hierarchy
    ├── app.json                    # Expo config, plugins (expo-local-authentication, expo-secure-store)
    ├── components/
    │   ├── HomeScreen.js           # Recent files, category shortcuts, storage overview card
    │   ├── LibraryScreen.js        # Media gallery grid (photos/videos filter, instant 250px thumbnails)
    │   ├── StorageScreen.js        # Drive list, usage gauges, Add Storage modal trigger
    │   ├── ControlPanelScreen.js   # Recycle Bin, Hardware Power, Network IPs, Tunnel status, Security
    │   ├── ConnectionScreen.js     # IP/Passcode & User Account login, QR Code scanner
    │   ├── FileViewerModal.js      # Google Photos media viewer (swipe pagination, pinch zoom, photo editor)
    │   ├── AutoSyncModal.js        # Mobile photo auto-backup folder selection & sync rules
    │   └── BottomNav.js            # Floating dark glass pill navigation dock (88% width, 34px radius)
    └── services/
        ├── biometricService.js     # expo-local-authentication wrapper (Face ID / Fingerprint / Passcode)
        └── secureStoreService.js   # expo-secure-store wrapper (Android KeyStore / iOS Keychain AES-256)
```

---

## 🔒 3. Security, Authentication & Data Layer

### Database Schema (`server/nas_data.db`)
Stored as an embedded SQLite database using `better-sqlite3` with **Write-Ahead Logging (WAL)** enabled (`PRAGMA journal_mode = WAL;`) to guarantee high concurrency and crash resilience:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified INTEGER DEFAULT 0,
  failed_attempts INTEGER DEFAULT 0,
  lock_until INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
```

### Security Policies
1. **Password Hashing**: Passwords are hashed with `bcryptjs` using 10 salt rounds. Auto-migrates legacy plaintext or scrypt hashes.
2. **Account Lockout**: 5 consecutive failed login attempts lock the account for 15 minutes (`lock_until`).
3. **HTTP Security Headers**: Express app uses `helmet()` to enforce HSTS, X-Content-Type-Options, and CSP policies.
4. **Rate Limiting**: `express-rate-limit` enforces 10 req/15 min on `/api/auth/*` and 150 req/min globally on `/api/*`.
5. **Path Traversal Defense**: `fileService.js` `validatePath()` rejects NUL bytes (`\0`, `%00`), relative escape attempts (`../`, `..\`), and verifies paths reside on configured NAS drives.
6. **Mobile Token Storage**: Authentication tokens are stored using `expo-secure-store` (Android KeyStore / iOS Keychain) with fallback to `AsyncStorage` on web.

---

## 🌐 4. API Endpoints Reference

### Authentication (`/api/auth/*`)
- `GET /api/auth/status` — Checks server setup status and email verification setting.
- `POST /api/auth/register` — Registers new account (`username`, `email`, `password`).
- `POST /api/auth/login` — Authenticates via 6-digit `passcode` OR `username` + `password`. Returns JWT token.
- `GET /api/auth/verify-email?token=...` — Verifies user email via token link.
- `GET /api/auth/verify` — Validates active JWT token in `Authorization: Bearer <token>` header.

### Storage & Drives (`/api/drives/*`)
- `GET /api/drives` — Retrieves allowed NAS drives with size, free space, and USB flag.
- `GET /api/drives/available` — Returns all system storage drives (for Add Storage modal).
- `POST /api/drives/add` — Registers a drive path or custom network share (`drivePath`, `label`).
- `DELETE /api/drives/remove` — Unregisters a drive path from NAS without deleting files.

### File Operations (`/api/files/*`)
- `GET /api/files?path=...` — Lists directory contents or drive roots if `path` omitted.
- `POST /api/upload?destination=...` — Accepts multipart file upload via `multer`.
- `POST /api/files/delete` — Intercepts deletion and moves file into `.nas_trash/`.
- `POST /api/files/batch-zip` — Streams an on-the-fly `.zip` archive of selected files using `archiver`.

### Media & Streaming
- `GET /api/stream?path=...&token=...` — Streams file with HTTP 206 Range support for video seeking.
- `GET /api/thumbnail?path=...&token=...` — Generates & serves 250px WebP thumbnail cached in `.nas_cache/thumbnails/`.
- `GET /api/gallery?drive=...` — Scans NAS drives for media files, sorted newest first.

### Recycle Bin (`/api/trash/*`)
- `GET /api/trash` — Lists items currently in Recycle Bin with original path metadata.
- `POST /api/trash/restore` — Restores item from `.nas_trash/` to original location.
- `DELETE /api/trash/purge?id=...` — Permanently purges specific item or all items older than 30 days.

### System & Tunnel (`/api/system`, `/api/tunnel/*`)
- `GET /api/system` — Returns server uptime, platform, IP addresses, Node version, passcode.
- `POST /api/system/reboot` & `POST /api/system/shutdown` — Triggers system power signals.
- `POST /api/system/cleanup` — Cleans temporary upload files.
- `GET /api/tunnel/status`, `POST /api/tunnel/start`, `POST /api/tunnel/stop` — Controls Cloudflare Tunnel.

---

## 🎨 5. Design System & UI Specifications

### Theme Tokens (Dark Liquid Glass)
- **Primary Background**: `#0B0F17` (Midnight Dark Navy)
- **Header Glass**: `rgba(15, 23, 42, 0.95)` with `borderBottomColor: 'rgba(255, 255, 255, 0.08)'`
- **Card Glass**: `rgba(30, 41, 59, 0.65)` with `borderColor: 'rgba(255, 255, 255, 0.08)'`
- **Cyan Accent**: `#00BCD4` (Primary glow) / `#22D3EE` (Light cyan text)
- **Text Color**: `#F8FAFC` (Primary text) / `#94A3B8` (Secondary text) / `#64748B` (Muted labels)

### Mobile Layout Hierarchy & Status Bar Safety
- **Root Layout (`App.js`)**: Top wrapper is `<View style={{ flex: 1, backgroundColor: '#0B0F17' }}>`.
- **Status Bar Inset Rule**: React Native's `<SafeAreaView>` does NOT apply top inset padding on Android when status bar is translucent. All header bars enforce:
  ```javascript
  paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16
  ```
- **Modal Rendering Hierarchy**: `FileViewerModal.js` is rendered **OUTSIDE** `SafeAreaView` at root level in `App.js` with `presentationStyle="fullScreen"` and `statusBarTranslucent={true}` so full-screen photo viewing covers native navigation overlays.
- **Floating Action Dock**: `BottomNav.js` and `FileViewerModal.js` action docks are styled as floating dark glass pills:
  ```javascript
  width: '88%', height: 68, borderRadius: 34, backgroundColor: 'rgba(15, 23, 42, 0.88)'
  ```

---

## ⚠️ 6. Important Technical Rules & Edge Cases

### 1. Windows Drive Path Resolution Rule
In Node.js on Windows, `path.resolve('C:')` resolves to the **process working directory on drive C** (e.g. `C:\Users\irfan\...`) instead of the drive root (`C:\`)!
- **Mandatory Rule**: Whenever validating or listing drive root paths, bare drive letters like `C:` MUST have a trailing backslash appended (`C:\`) before passing to `path.resolve()` or `fs.readdir()`!
  ```javascript
  if (/^[a-zA-Z]:$/.test(p)) p += '\\';
  ```

### 2. Extension Normalization Pattern
Media file extension checking MUST use `normalizeExt(file)` and `Set` objects (`IMAGE_EXTS`, `VIDEO_EXTS`) to strip leading dots and force lowercasing, preventing raw extension mismatches.

### 3. Photo Viewer Gesture Architecture (`FileViewerModal.js`)
- **Pinch Zoom**: Outer `<ScrollView minimumZoomScale={1} maximumZoomScale={5} pinchGestureEnabled={true}>`.
- **Double Tap**: Double tap toggles zoom scale between `1x` and `2.5x`.
- **Gallery Swipe**: Horizontal `FlatList` with `pagingEnabled={true}` and `onMomentumScrollEnd` updating active index.

---

## 🛠️ 7. Development & Deployment Commands

### Development Setup
```powershell
# Start Node.js Server (Port 3000)
cd server
node index.js

# Start Expo Mobile App
cd mobile
npx expo start
```

### Production PM2 Server Run
```powershell
cd server
pm2 start ecosystem.config.js
```

### Mobile Verification
```powershell
cd mobile
npx expo-doctor
```
