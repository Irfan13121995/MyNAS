# Personal NAS - Architectural Code Graph & Technical Specification

> **Target Audience**: AI Models, Autonomous Coding Agents, and Technical Architects.  
> **Purpose**: Provides a comprehensive, structured code graph, dependency matrix, component hierarchy, data flow diagrams, and API specifications for understanding, extending, and implementing the **Personal NAS** project.

---

## 1. System Architecture Overview

```mermaid
graph TD
    subgraph Mobile Client [Expo React Native App]
        AppJS[App.js - App Root & Navigation]
        ThemeCtx[ThemeContext.js]
        
        subgraph Mobile Screens
            ConnScreen[ConnectionScreen.js]
            HomeScreen[HomeScreen.js]
            LibScreen[LibraryScreen.js]
            StorScreen[StorageScreen.js]
            CtrlScreen[ControlPanelScreen.js]
            BrowserScreen[BrowserScreen.js]
        end

        subgraph Mobile Modals & Components
            AutoSyncModal[AutoSyncModal.js]
            FileExpModal[FileExplorerModal.js]
            FileViewModal[FileViewerModal.js]
            TunnelPanelComp[TunnelPanel.js]
            BackupPanelComp[BackupPanel.js]
            GaugeComp[CircularGauge.js]
        end

        subgraph Mobile Services
            SyncService[syncService.js - AutoSync & Uploads]
            ApiFetch[apiFetch.js - HTTP Client]
            SecureStore[secureStoreService.js]
            CacheService[cacheService.js]
            OfflineQueue[offlineQueueService.js]
            BioService[biometricService.js]
        end
    end

    subgraph Web Desktop Client [Vanilla JS & Glassmorphic UI]
        WebIndex[index.html]
        WebStyle[style.css]
        WebAppJS[app.js]
    end

    subgraph Backend Server [Node.js Express & SQLite]
        ServerIndex[index.js - REST Server & Routing]
        ElectronMain[main.js - Desktop Shell]
        
        subgraph Server Core Services
            DBService[dbService.js - SQLite ORM]
            FileService[fileService.js - File & Gallery I/O]
            DriveService[driveService.js - Disk Detection]
            DriveConfig[driveConfigService.js - Target Paths]
            TunnelService[tunnelService.js - Cloudflare]
            EmailService[emailService.js - SMTP Notifications]
            StreamService[streamService.js - Media Range Streaming]
            ThumbService[thumbnailService.js - Sharp Thumbnails]
            TrashService[trashService.js - Recyle Bin Manager]
            UsersService[usersService.js - User Migrations]
        end

        Database[(SQLite: nas_data.db)]
        FileSystem[[Host Storage / Disks C:, D:, etc.]]
        Cloudflare[[Cloudflare Tunnel Binary / Network]]
    end

    %% Client-Server Connections
    ConnScreen -->|HTTP / REST| ServerIndex
    ApiFetch -->|HTTP / REST| ServerIndex
    SyncService -->|Uploads / Target Validation| ServerIndex
    WebAppJS -->|Fetch API| ServerIndex

    %% Server Internal Wiring
    ServerIndex --> DBService
    ServerIndex --> FileService
    ServerIndex --> DriveService
    ServerIndex --> DriveConfig
    ServerIndex --> TunnelService
    ServerIndex --> EmailService
    ServerIndex --> StreamService
    ServerIndex --> ThumbService
    ServerIndex --> TrashService
    ServerIndex --> UsersService

    DBService --> Database
    FileService --> FileSystem
    DriveService --> FileSystem
    TunnelService --> Cloudflare
```

---

## 2. Server Architecture & Module Dependency Matrix (`server/`)

### 2.1 File Map & Responsibilities

| Module | Responsibility | Primary Exports / Functions | Key Dependencies |
| :--- | :--- | :--- | :--- |
| [`index.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/index.js) | Main Express HTTP server, REST routes, auth middlewares, CORS, rate limiting, static web serving. | Express App Listener, Route Handlers | `express`, `cors`, `helmet`, `express-rate-limit`, `jsonwebtoken` |
| [`dbService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/dbService.js) | SQLite database interface for users, activity logs, sync manifests. | `getUserByEmail`, `createUser`, `logActivity`, `isSynced`, `recordSync`, `getSyncManifest` | `better-sqlite3`, `bcryptjs` |
| [`fileService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/fileService.js) | File Explorer operations, media gallery scanner, chunked upload processing, zip downloads. | `getDirectoryContents`, `getMediaGallery`, `handleChunkUpload`, `createZipArchive` | `fs`, `path`, `archiver`, `multer` |
| [`driveService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/driveService.js) | Windows WMI / PowerShell disk space detection and drive letter caching (5s TTL). | `getStorageDrives`, `getDriveSpace` | `child_process` (PowerShell `Get-Volume`) |
| [`driveConfigService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/driveConfigService.js) | Custom backup path validation, writability checks, target storage path resolution. | `getBackupDriveConfig`, `validateBackupTarget`, `setBackupDriveConfig` | `fs`, `path` |
| [`tunnelService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/tunnelService.js) | Cloudflare Quick Tunnels (`*.trycloudflare.com`) and Named Tunnel process manager. | `startQuickTunnel`, `getTunnelStatus`, `stopTunnel` | `child_process` (`cloudflared`) |
| [`emailService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/emailService.js) | SMTP client for sending verification codes and system notifications. | `sendVerificationEmail`, `sendAlertEmail` | `nodemailer` |
| [`streamService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/streamService.js) | HTTP 206 Partial Content video and audio range streaming. | `streamMediaFile` | `fs` |
| [`thumbnailService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/thumbnailService.js) | Image thumbnail generation and persistent disk caching. | `generateThumbnail` | `sharp` |
| [`trashService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/trashService.js) | Soft delete / restore system with `.nas_trash` folder management. | `moveToTrash`, `restoreFromTrash`, `emptyTrash` | `fs`, `path` |
| [`usersService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/usersService.js) | Migration from legacy `users.json` file to SQLite database. | `migrateLegacyUsers` | `dbService` |
| [`main.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/main.js) | Electron Desktop container wrapper for Windows background system tray operation. | Electron `app`, `BrowserWindow` | `electron` |

---

### 2.2 Server API Endpoint Index

```
REST API Routes (index.js)
├── /api/auth
│   ├── POST /login               -> Verify 6-digit passcode or username/password -> JWT Token
│   ├── POST /register            -> Register new user account with bcrypt hashing
│   └── POST /verify-email        -> Verify email token
├── /api/drives
│   └── GET  /                    -> List mounted storage drives & disk space stats
├── /api/files
│   ├── GET  /list                -> List files and subfolders in directory path
│   ├── GET  /download            -> Stream single file or batch ZIP archive
│   ├── POST /delete              -> Soft-delete to trash or permanent delete
│   ├── POST /mkdir               -> Create new subfolder
│   └── POST /rename              -> Move/rename file or folder
├── /api/upload
│   ├── POST /                    -> Standard multipart file upload
│   └── POST /chunk               -> 5MB chunked streaming upload for large files/videos
├── /api/sync
│   ├── POST /validate-target     -> Check target drive/folder writability & free space
│   ├── GET  /manifest            -> Retrieve device sync history manifest
│   └── POST /record              -> Record synced file hash in SQLite manifest
├── /api/gallery
│   └── GET  /                    -> Paginated media items across drives with format filtering
├── /api/stream
│   └── GET  /video               -> HTTP Range 206 video/audio streaming endpoint
├── /api/tunnel
│   ├── GET  /status              -> Active Cloudflare tunnel URL and status
│   └── POST /toggle              -> Start/Stop Cloudflare tunnel process
└── /api/system
    └── GET  /info                -> Hostname, IP addresses, system uptime, active passcode
```

---

## 3. Mobile App Code Graph (`mobile/`)

```mermaid
graph TD
    App[App.js] --> ThemeContext[contexts/ThemeContext.js]
    
    %% Navigation Screens
    App --> ConnectionScreen[components/ConnectionScreen.js]
    App --> HomeScreen[components/HomeScreen.js]
    App --> LibraryScreen[components/LibraryScreen.js]
    App --> StorageScreen[components/StorageScreen.js]
    App --> ControlPanelScreen[components/ControlPanelScreen.js]
    App --> BrowserScreen[components/BrowserScreen.js]

    %% Shared Modals
    HomeScreen --> AutoSyncModal[components/AutoSyncModal.js]
    HomeScreen --> FileExplorerModal[components/FileExplorerModal.js]
    HomeScreen --> BackupPanel[components/BackupPanel.js]
    
    LibraryScreen --> FileExplorerModal
    LibraryScreen --> FileViewerModal[components/FileViewerModal.js]
    
    StorageScreen --> CircularGauge[components/CircularGauge.js]
    ControlPanelScreen --> TunnelPanel[components/TunnelPanel.js]

    %% Mobile Service Layer
    AutoSyncModal --> SyncService[services/syncService.js]
    LibraryScreen --> SyncService
    ConnectionScreen --> ApiFetch[services/apiFetch.js]
    ConnectionScreen --> SecureStore[services/secureStoreService.js]
    ConnectionScreen --> BioService[services/biometricService.js]
    
    SyncService --> CacheService[services/cacheService.js]
    SyncService --> OfflineQueue[services/offlineQueueService.js]
```

---

### 3.1 Mobile File Responsibilities

| File | Purpose | Key Exports & Hooks |
| :--- | :--- | :--- |
| [`App.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/App.js) | Root application component. Registers background fetch task `BACKGROUND_AUTOSYNC_TASK`, manages global authentication state, and mounts navigation tab bar. | `App` |
| [`contexts/ThemeContext.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/contexts/ThemeContext.js) | Provides dark/light theme tokens across all components with persistent storage. | `ThemeProvider`, `useTheme` |
| [`components/ConnectionScreen.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/components/ConnectionScreen.js) | Server connection screen. Supports QR Code scanning, passcode login, user account login/register, and automatic Wi-Fi subnet scanning. | `ConnectionScreen` |
| [`components/HomeScreen.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/components/HomeScreen.js) | Dashboard tab. Shows quick action cards, server storage usage gauge, auto-sync status card, and quick upload buttons. | `HomeScreen` |
| [`components/LibraryScreen.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/components/LibraryScreen.js) | Gallery tab. Dual-mode viewer (`NAS Server` & `📱 Phone Gallery`), paginated `FlashList`, media extension filters, multiselect action bar, and direct targeted NAS upload modal. | `LibraryScreen` |
| [`components/StorageScreen.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/components/StorageScreen.js) | Drive management tab. Displays circular gauges for each mounted drive and lets users configure default target backup drives. | `StorageScreen` |
| [`components/ControlPanelScreen.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/components/ControlPanelScreen.js) | System settings tab. Manages Cloudflare Tunnels, system passcode, registered user accounts, and real-time server logs. | `ControlPanelScreen` |
| [`components/BrowserScreen.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/components/BrowserScreen.js) | Interactive File Explorer tab for navigating NAS disk directories, opening files, and creating folders. | `BrowserScreen` |
| [`components/FileExplorerModal.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/components/FileExplorerModal.js) | Reusable directory picker modal. Supports `mode="browse"` and `mode="selectFolder"` with path navigation and `+ Folder` creation. | `FileExplorerModal` |
| [`components/AutoSyncModal.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/components/AutoSyncModal.js) | Auto-Sync settings dialog. Lets users pick target NAS drive and folder, set sync frequency, and enable background sync. | `AutoSyncModal` |
| [`services/syncService.js`](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/mobile/services/syncService.js) | Core Auto-Sync Engine. Handles local media scanning, SHA-256 deduplication, target validation, standard upload, and 5MB chunked upload. | `runFullAutoSync`, `uploadFile`, `uploadFileChunked`, `getSyncConfig`, `setSyncConfig` |

---

## 4. Web Dashboard Code Graph (`server/public/`)

```
server/public/
├── index.html     -> Main HTML5 single-page application structure. Contains navigation sidebar, storage gauges, drive cards, file explorer table, gallery modal, and system logs console.
├── style.css      -> Apple Frosted Glassmorphism design system. 3-layer animated mesh background, light/dark mode variables, glass card components, custom scrollbars, and responsive layouts.
└── app.js         -> Single-page JavaScript application logic. Handles authentication session tokens, WebSocket/REST metric polling, interactive file explorer CRUD operations, chunked file uploads, media viewer, and tunnel toggles.
```

---

## 5. End-to-End Key Data Flows

### 5.1 Flow A: Mobile Pairing & Authentication

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App as Mobile App (ConnectionScreen)
    participant Server as Node.js Server (index.js)
    participant DB as SQLite (nas_data.db)

    User->>App: Scan Web App QR Code or Enter Passcode
    App->>Server: POST /api/auth/login { passcode: "881612" }
    Server->>Server: Verify passcode against active system passcode
    alt Valid Passcode
        Server-->>App: { success: true, token: "JWT_TOKEN", user: {...} }
        App->>App: Store token in expo-secure-store
        App->>User: Navigate to HomeScreen Dashboard
    else Invalid Passcode
        Server-->>App: HTTP 401 Unauthorized
        App->>User: Display Connection Error Alert
    end
```

---

### 5.2 Flow B: Direct Mobile Gallery Targeted NAS Batch Upload

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Lib as LibraryScreen.js
    participant Media as expo-media-library
    participant Sync as syncService.js
    participant Server as fileService.js (Node.js)

    User->>Lib: Switch to "📱 Phone Gallery" Tab
    Lib->>Media: MediaLibrary.getAssetsAsync({ first: 100, mediaType: [...] })
    Media-->>Lib: Returns asset URIs & metadata
    User->>Lib: Select items (or tap "Select All") & tap "📤 Upload to NAS"
    Lib->>User: Display Target Disk & Folder Selection Modal
    User->>Lib: Choose Target Drive "D:" & Folder "D:\MobileUploads" -> Tap "Start Upload"
    Lib->>Lib: Open Progress Modal (Percent & Counter)

    loop For Each Selected Media Item
        Lib->>Sync: uploadFile(uri, targetFolder, serverUrl, token, onProgress)
        Sync->>Sync: Check file size (> 10MB triggers chunked upload)
        alt File Size <= 10MB
            Sync->>Server: POST /api/upload (Multipart FormData)
        else File Size > 10MB
            loop 5MB Chunks
                Sync->>Server: POST /api/upload/chunk (chunkIndex, totalChunks, uploadId)
            end
        end
        Server-->>Sync: HTTP 200 OK { success: true, filePath: "..." }
        Sync-->>Lib: Update progress counter & percentage bar
    end

    Lib->>User: Display "Batch Upload Complete!" Alert
```

---

### 5.3 Flow C: Background Auto-Sync & Deduplication Engine

```mermaid
sequenceDiagram
    autonumber
    participant Task as Expo TaskManager (BACKGROUND_AUTOSYNC_TASK)
    participant Sync as syncService.js
    participant Server as Server REST API

    Task->>Sync: Trigger runFullAutoSync()
    Sync->>Server: POST /api/sync/validate-target { targetFolder: "D:\Backups\Phone" }
    Server-->>Sync: { valid: true, writable: true, freeSpaceBytes: 50000000000 }
    
    Sync->>Sync: Query local phone media assets
    Sync->>Server: GET /api/sync/manifest?deviceId=X
    Server-->>Sync: Returns array of previously synced file hashes

    loop For Each New Media Asset
        Sync->>Sync: Calculate SHA-256 hash of file header
        alt Hash exists in Server Manifest
            Sync->>Sync: Skip upload (Deduplicated)
        else Hash is new
            Sync->>Server: Upload file via POST /api/upload
            Sync->>Server: POST /api/sync/record { deviceId, fileHash, fileName, size }
        end
    end
```

---

## 6. Database ERD & Schema (`nas_data.db`)

```mermaid
erDiagram
    users {
        INTEGER id PK
        TEXT email UNIQUE
        TEXT username
        TEXT password_hash
        TEXT role
        INTEGER is_verified
        TEXT verification_token
        TEXT created_at
    }

    activity_logs {
        INTEGER id PK
        INTEGER user_id FK
        TEXT action
        TEXT details
        TEXT ip_address
        TEXT timestamp
    }

    sync_manifest {
        INTEGER id PK
        TEXT device_id
        TEXT file_hash
        TEXT file_name
        INTEGER file_size
        TEXT nas_target_path
        TEXT synced_at
    }

    users ||--o{ activity_logs : "generates"
```

---

## 7. Implementation & Environment Setup

### 7.1 Prerequisites
- **Node.js**: v18.0.0 or higher
- **Expo CLI**: v52.0.0+ / EAS CLI v21.0.0+
- **Host OS**: Windows 10 / 11 (for native PowerShell drive detection and WMI features)

### 7.2 Running the Stack Locally
```bash
# 1. Start Server Backend & Web App
cd server
npm install
node index.js
# Serves Web App at http://localhost:3000

# 2. Start Expo Mobile Development Server
cd mobile
npm install
npx expo start

# 3. Build Production Android APK via EAS
cd mobile
npx eas-cli build --platform android --profile preview
```
