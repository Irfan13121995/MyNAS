# Personal NAS — Installer Build Guide

> Step-by-step instructions to compile the `PersonalNAS_Installer.exe` from source.

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| **Inno Setup** | 6.x (64-bit) | https://jrsoftware.org/isdl.php |
| **Node.js** | v24.18.0 LTS | https://nodejs.org/ |
| **PowerShell** | 5.1+ (built into Windows 11) | — |
| **NSSM** | 2.24 (64-bit) | https://nssm.cc/download |
| **ImageMagick** (optional) | 7.x | https://imagemagick.org/ |

---

## 1. Prepare the Bundle Directory

Start from the repository root (`personal-nas/`). The `installer/` directory should already contain:

```
installer/
├── setup.iss
├── scripts/
│   ├── install-service.ps1
│   └── uninstall-service.ps1
├── tools/          ← you will populate this
├── assets/         ← you will populate this
└── server/         ← you will populate this
```

---

## 2. Copy Server Files

Copy the **production server** files into `installer/server/`:

```powershell
# From repository root
$src = "server"
$dst = "installer\server"

# Create destination
New-Item -ItemType Directory -Path $dst -Force | Out-Null

# Copy application files
$files = @(
    "index.js", "dbService.js", "usersService.js", "fileService.js",
    "driveService.js", "driveConfigService.js", "thumbnailService.js",
    "trashService.js", "streamService.js", "tunnelService.js",
    "emailService.js", "detect_drives.ps1", "package.json", "package-lock.json",
    "users.json"
)
foreach ($f in $files) {
    Copy-Item "$src\$f" "$dst\$f" -Force
}

# Copy public directory (web dashboard)
Copy-Item "$src\public" "$dst\public" -Recurse -Force

# Copy cloudflared directory structure (binary downloaded at runtime if missing)
New-Item -ItemType Directory -Path "$dst\cloudflared" -Force | Out-Null
```

> **DO NOT** copy: `.env`, `nas_data.db`, `nas_data.db-shm`, `nas_data.db-wal`, `node_modules/`, `dist/`, `.nas_cache/`, `temp_uploads/`

---

## 3. Install Production Dependencies

Run `npm ci` inside `installer/server/` to install a clean production `node_modules/`:

```powershell
cd installer\server
npm ci --omit=dev
cd ..\..
```

This installs all runtime dependencies (`express`, `better-sqlite3`, `sharp`, etc.) with prebuilt native binaries matching your current Node.js version and OS.

> [!IMPORTANT]
> You **must** run `npm ci` on the same Node.js version (v24) and OS architecture (Windows x64) that end users will have. The `better-sqlite3` and `sharp` packages include prebuilt `.node` native binaries that are platform-specific.

---

## 4. Obtain NSSM

Download NSSM 2.24 from https://nssm.cc/download:

```powershell
# Download and extract
Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "$env:TEMP\nssm.zip"
Expand-Archive "$env:TEMP\nssm.zip" -DestinationPath "$env:TEMP\nssm" -Force

# Copy 64-bit binary
Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" "installer\tools\nssm.exe" -Force

# Cleanup
Remove-Item "$env:TEMP\nssm.zip", "$env:TEMP\nssm" -Recurse -Force
```

---

## 5. Generate Application Icon

Convert the existing `favicon.png` to `.ico` format for the installer UI and shortcuts.

### Option A: Using ImageMagick (recommended)

```powershell
magick server\public\favicon.png -define icon:auto-resize=256,128,64,48,32,16 installer\assets\logo.ico
```

### Option B: Using an Online Converter

1. Go to https://convertico.com/ or https://icoconvert.com/
2. Upload `server/public/favicon.png`
3. Select sizes: 256, 128, 64, 48, 32, 16
4. Download the `.ico` file
5. Save as `installer/assets/logo.ico`

### Option C: Using PowerShell + System.Drawing

```powershell
Add-Type -AssemblyName System.Drawing
$png = [System.Drawing.Image]::FromFile("$(Get-Location)\server\public\favicon.png")
$icon = [System.Drawing.Icon]::FromHandle($png.GetHicon())
$stream = [System.IO.File]::Create("$(Get-Location)\installer\assets\logo.ico")
$icon.Save($stream)
$stream.Close()
$png.Dispose()
```

> Note: The PowerShell method generates a single-size icon. ImageMagick is preferred for multi-resolution `.ico` files.

---

## 6. Verify Bundle Structure

Before compiling, confirm this exact structure exists:

```
installer/
├── setup.iss
├── scripts/
│   ├── install-service.ps1
│   └── uninstall-service.ps1
├── tools/
│   └── nssm.exe              ← 64-bit, ~300 KB
├── assets/
│   └── logo.ico              ← multi-resolution icon
└── server/
    ├── index.js
    ├── dbService.js
    ├── usersService.js
    ├── fileService.js
    ├── driveService.js
    ├── driveConfigService.js
    ├── thumbnailService.js
    ├── trashService.js
    ├── streamService.js
    ├── tunnelService.js
    ├── emailService.js
    ├── detect_drives.ps1
    ├── package.json
    ├── package-lock.json
    ├── users.json
    ├── node_modules/          ← from npm ci --omit=dev
    ├── cloudflared/           ← empty dir (binary downloaded at runtime)
    └── public/
        ├── index.html
        ├── app.js
        ├── style.css
        ├── favicon.png
        └── assets/
            └── logo.png
```

---

## 7. Compile the Installer

### Using Inno Setup GUI

1. Open **Inno Setup Compiler** (`Compil32.exe`)
2. File → Open → select `installer/setup.iss`
3. Build → Compile (or press `Ctrl+F9`)
4. Output: `installer/Output/PersonalNAS_Installer.exe`

### Using Command Line (ISCC)

```powershell
# ISCC.exe is in the Inno Setup installation directory
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\setup.iss
```

Or if Inno Setup is in PATH:

```powershell
ISCC installer\setup.iss
```

**Output**: `installer\Output\PersonalNAS_Installer.exe` (single-file, ~60-100 MB depending on node_modules size)

---

## 8. Test the Installer

### On a Clean VM (Recommended)

1. Spin up a fresh Windows 11 VM (Hyper-V, VirtualBox, or VMware)
2. Copy `PersonalNAS_Installer.exe` to the VM
3. Run the installer as Administrator
4. Walk through the wizard:
   - Accept default port `3000`
   - Accept default storage `C:\PersonalNAS_Storage`
   - Leave tunnel token blank
5. Verify:
   - `http://localhost:3000` opens the dashboard in a browser
   - `Get-Service PersonalNAS_Server` shows `Running`
   - Desktop shortcut opens the dashboard
   - `C:\PersonalNAS_Storage\Mobile Backups\` directory exists
   - Firewall rules exist: `Get-NetFirewallRule -DisplayName 'PersonalNAS_*'`

### Test Uninstaller

1. Open **Settings → Apps → Installed Apps**
2. Find "Personal NAS" and click Uninstall
3. Verify:
   - Service is removed: `Get-Service PersonalNAS_Server` returns error
   - Firewall rules removed
   - `C:\PersonalNAS_Storage\` still exists (data preserved by default)

---

## Troubleshooting

### `better-sqlite3` Fails to Load
- Ensure `npm ci --omit=dev` was run with the **same Node.js version** that will run on the target machine
- If building on Node v24, the target must also have Node v24

### Installer Shows "Node.js not found" Despite Being Installed
- The installer checks `node --version` using the system PATH
- If Node.js was just installed by the installer itself, PATH is refreshed from the registry

### Service Fails to Start
- Check logs at `{InstallDir}\logs\service_stdout.log` and `service_stderr.log`
- Common cause: port conflict — another process is using port 3000
- Run `netstat -ano | findstr :3000` to check

### Firewall Rules Not Created
- Ensure the installer ran with Administrator privileges
- Manually create: `New-NetFirewallRule -DisplayName "PersonalNAS_HTTP_3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow`
