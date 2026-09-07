param(
    [Parameter(Mandatory=$false)][string]$InstallDir = "",
    [Parameter(Mandatory=$false)][string]$Port = "3000",
    [Parameter(Mandatory=$false)][string]$StoragePath = "C:\NAS_Storage",
    [Parameter(Mandatory=$false)][string]$TunnelToken = ""
)

try {
    # Resolve InstallDir automatically to repo root if omitted
    if ([string]::IsNullOrWhiteSpace($InstallDir)) {
        $InstallDir = (Resolve-Path "$PSScriptRoot\..\..").Path
    }

    # Step 1: Logging Setup
    $logPath = Join-Path $InstallDir 'install.log'
    function Write-Log {
        param([string]$Message)
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $logMessage = "[$timestamp] $Message"
        Write-Host $logMessage
        Add-Content -Path $logPath -Value $logMessage -ErrorAction SilentlyContinue
    }

    Write-Log "Starting Personal NAS installation process at $InstallDir..."

    # Step 2: Node.js Verification
    Write-Log "Checking Node.js version..."
    $nodeFound = $false
    try {
        $nodeVersionStr = (node --version 2>&1) | Out-String
        if ($nodeVersionStr -match 'v(\d+)') {
            $majorVersion = [int]$matches[1]
            if ($majorVersion -ge 18) {
                $nodeFound = $true
                Write-Log "Node.js version $nodeVersionStr found."
            } else {
                Write-Log "Node.js version $nodeVersionStr is too old (requires 18+)."
            }
        }
    } catch {
        Write-Log "Node.js not found or error checking version."
    }

    if (-not $nodeFound) {
        Write-Log "Downloading Node.js LTS MSI..."
        $msiUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
        $msiPath = Join-Path $env:TEMP "node-lts-x64.msi"
        Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
        
        Write-Log "Installing Node.js..."
        $installArgs = "/i `"$msiPath`" /qn ADDLOCAL=ALL"
        Start-Process msiexec.exe -ArgumentList $installArgs -Wait -NoNewWindow
        
        Write-Log "Refreshing environment variables..."
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        try {
            $newNodeVersion = (node --version 2>&1) | Out-String
            Write-Log "Node.js installed successfully: $newNodeVersion"
        } catch {
            Write-Log "WARNING: Could not verify Node.js version after installation."
        }

        Write-Log "Cleaning up MSI file..."
        Remove-Item -Path $msiPath -Force -ErrorAction SilentlyContinue
    }

    # Step 2.5: Install Server NPM Dependencies
    $serverDir = Join-Path $InstallDir 'server'
    $nodeModulesDir = Join-Path $serverDir 'node_modules'
    if (-not (Test-Path $nodeModulesDir)) {
        Write-Log "Installing server npm dependencies (please wait)..."
        Push-Location $serverDir
        try {
            cmd.exe /c "npm install --omit=dev"
            Write-Log "npm dependencies installed successfully."
        } catch {
            Write-Log "WARNING: npm install encountered an error: $($_.Exception.Message)"
        } finally {
            Pop-Location
        }
    } else {
        Write-Log "server/node_modules already present."
    }

    # Step 3: Cloudflared Check
    $cloudflaredDir = Join-Path $InstallDir "server\cloudflared"
    $cloudflaredExe = Join-Path $cloudflaredDir "cloudflared.exe"
    
    if (-not (Test-Path $cloudflaredExe)) {
        Write-Log "Cloudflared not found. Downloading..."
        if (-not (Test-Path $cloudflaredDir)) {
            New-Item -ItemType Directory -Path $cloudflaredDir -Force | Out-Null
        }
        $cfUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        try {
            Invoke-WebRequest -Uri $cfUrl -OutFile $cloudflaredExe -UseBasicParsing
            Write-Log "Cloudflared downloaded successfully."
        } catch {
            Write-Log "WARNING: Failed to download cloudflared: $($_.Exception.Message)"
        }
    } else {
        Write-Log "Cloudflared already exists at $cloudflaredExe"
    }

    # Step 4: Generate .env File
    $envPath = Join-Path $InstallDir "server\.env"
    $passcode = ""
    if (Test-Path $envPath) {
        Write-Log "Existing .env preserved"
        $envContent = Get-Content $envPath
        $passcodeMatch = $envContent -match "^PASSCODE=(.+)$"
        if ($passcodeMatch) {
            $passcode = $matches[1]
        }
    } else {
        Write-Log "Generating new .env file..."
        $jwtBytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
        $jwtSecret = [System.BitConverter]::ToString($jwtBytes).Replace("-", "").ToLower()
        $passcode = Get-Random -Minimum 100000 -Maximum 999999
        
        $envContent = @(
            "PORT=$Port",
            "JWT_SECRET=$jwtSecret",
            "PASSCODE=$passcode",
            "REQUIRE_EMAIL_VERIFICATION=false"
        )
        if (-not [string]::IsNullOrEmpty($TunnelToken)) {
            $envContent += "CLOUDFLARE_TUNNEL_TOKEN=$TunnelToken"
        }
        
        $envContent | Set-Content -Path $envPath
        Write-Log ".env file created successfully."
    }

    # Step 5: Create Storage Directory
    Write-Log "Creating storage directories..."
    $dirs = @(
        $StoragePath,
        (Join-Path $StoragePath 'Mobile Backups')
    )
    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Log "Created directory: $dir"
        }
    }

    # Step 6: Install & Configure NSSM Service
    Write-Log "Configuring Windows Service using NSSM..."
    $toolsDir = Join-Path $InstallDir 'installer\tools'
    if (-not (Test-Path $toolsDir)) {
        New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
    }
    $nssmPath = Join-Path $toolsDir 'nssm.exe'
    if (-not (Test-Path $nssmPath)) {
        $legacyToolsNssm = Join-Path $InstallDir 'tools\nssm.exe'
        if (Test-Path $legacyToolsNssm) {
            $nssmPath = $legacyToolsNssm
        } else {
            Write-Log "nssm.exe not found. Downloading NSSM 2.24..."
            try {
                $nssmZip = Join-Path $env:TEMP 'nssm-2.24.zip'
                $nssmUrl = 'https://nssm.cc/release/nssm-2.24.zip'
                Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZip -UseBasicParsing
                Expand-Archive -Path $nssmZip -DestinationPath (Join-Path $env:TEMP 'nssm_extracted') -Force
                Copy-Item -Path (Join-Path $env:TEMP 'nssm_extracted\nssm-2.24\win64\nssm.exe') -Destination $nssmPath -Force
                Write-Log "NSSM 64-bit extracted to $nssmPath"
            } catch {
                Write-Log "WARNING: Could not auto-download NSSM: $($_.Exception.Message)"
            }
        }
    }
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nodePath) {
        $nodePath = "C:\Program Files\nodejs\node.exe"
    }
    $serverDir = Join-Path $InstallDir 'server'
    $serviceName = 'PersonalNAS_Server'

    # Remove existing service if present (upgrade)
    & $nssmPath stop $serviceName 2>$null
    & $nssmPath remove $serviceName confirm 2>$null
    Start-Sleep -Seconds 2

    # Install service
    & $nssmPath install $serviceName $nodePath
    & $nssmPath set $serviceName AppDirectory $serverDir
    & $nssmPath set $serviceName AppParameters 'index.js'
    & $nssmPath set $serviceName DisplayName 'Personal NAS Server'
    & $nssmPath set $serviceName Description 'Personal NAS Node.js Express Server - Web Dashboard and File Manager'
    & $nssmPath set $serviceName Start SERVICE_AUTO_START
    & $nssmPath set $serviceName ObjectName 'LocalSystem'

    # Crash recovery - restart automatically
    & $nssmPath set $serviceName AppExit Default Restart
    & $nssmPath set $serviceName AppRestartDelay 5000
    & $nssmPath set $serviceName AppStopMethodSkip 6
    & $nssmPath set $serviceName AppStopMethodConsole 3000
    & $nssmPath set $serviceName AppStopMethodWindow 3000
    & $nssmPath set $serviceName AppStopMethodThreads 1000

    # Stdout/Stderr logging
    $logDir = Join-Path $InstallDir 'logs'
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    & $nssmPath set $serviceName AppStdout (Join-Path $logDir 'service_stdout.log')
    & $nssmPath set $serviceName AppStderr (Join-Path $logDir 'service_stderr.log')
    & $nssmPath set $serviceName AppStdoutCreationDisposition 4
    & $nssmPath set $serviceName AppStderrCreationDisposition 4
    & $nssmPath set $serviceName AppRotateFiles 1
    & $nssmPath set $serviceName AppRotateOnline 1
    & $nssmPath set $serviceName AppRotateBytes 5242880

    # Set environment for the service
    & $nssmPath set $serviceName AppEnvironmentExtra "NODE_ENV=production"

    # Start the service
    & $nssmPath start $serviceName
    Start-Sleep -Seconds 3

    # Verify service is running
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
        Write-Log "Service '$serviceName' started successfully."
    } else {
        Write-Log "WARNING: Service '$serviceName' may not have started. Check logs."
    }

    # Step 7: Firewall Rules
    Write-Log "Configuring firewall rules..."
    # Remove existing rules first (idempotent)
    Remove-NetFirewallRule -DisplayName "PersonalNAS_HTTP_$Port" -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName 'PersonalNAS_mDNS' -ErrorAction SilentlyContinue

    # HTTP inbound
    New-NetFirewallRule -DisplayName "PersonalNAS_HTTP_$Port" `
        -Direction Inbound -Protocol TCP -LocalPort $Port `
        -Action Allow -Profile Private,Domain `
        -Description 'Allow LAN access to Personal NAS web dashboard' | Out-Null

    # mDNS (Bonjour discovery)
    New-NetFirewallRule -DisplayName 'PersonalNAS_mDNS' `
        -Direction Inbound -Protocol UDP -LocalPort 5353 `
        -Action Allow -Profile Private,Domain `
        -Description 'Allow mDNS/Bonjour for Personal NAS LAN discovery' | Out-Null

    # Step 8: Final Summary
    $summary = @"
========================================
  Personal NAS Installation Complete!
  Dashboard: http://localhost:$Port
  Passcode: $passcode
  Service: $serviceName (Running)
========================================
"@
    Write-Log $summary

} catch {
    if ($logPath) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $errorMsg = "[$timestamp] ERROR: $($_.Exception.Message)`n$($_.ScriptStackTrace)"
        Write-Host $errorMsg -ForegroundColor Red
        Add-Content -Path $logPath -Value $errorMsg -ErrorAction SilentlyContinue
    } else {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit 1
}
