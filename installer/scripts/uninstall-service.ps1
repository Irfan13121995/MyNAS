param(
    [Parameter(Mandatory=$true)][string]$InstallDir
)

try {
    # 1. Logging
    $logPath = Join-Path $InstallDir 'uninstall.log'
    function Write-Log {
        param([string]$Message)
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $logMessage = "[$timestamp] $Message"
        Write-Host $logMessage
        if (Test-Path (Split-Path $logPath)) {
            Add-Content -Path $logPath -Value $logMessage -ErrorAction SilentlyContinue
        }
    }

    Write-Log "Starting uninstall process..."

    # 2. Stop & Remove Windows Service
    $nssmPath = Join-Path $InstallDir 'tools\nssm.exe'
    $serviceName = 'PersonalNAS_Server'

    if (Test-Path $nssmPath) {
        # Stop service gracefully, then force
        & $nssmPath stop $serviceName 2>&1 | Out-Null
        Start-Sleep -Seconds 3

        # Remove service
        & $nssmPath remove $serviceName confirm 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    } else {
        # Fallback if nssm is missing
        Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    }

    # 3. Kill Cloudflared Processes
    Stop-Process -Name 'cloudflared' -Force -ErrorAction SilentlyContinue
    Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    # 4. Kill Orphaned Node Processes (only those running from the install directory)
    Get-Process -Name 'node' -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and ($_.Path -like "$InstallDir*")
    } | Stop-Process -Force -ErrorAction SilentlyContinue

    # 5. Remove Firewall Rules
    Get-NetFirewallRule -DisplayName 'PersonalNAS_*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue

    # 6. Log completion
    Write-Log "Personal NAS service and firewall rules removed successfully."

} catch {
    if ($logPath -and (Test-Path (Split-Path $logPath))) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $errorMsg = "[$timestamp] ERROR during uninstall: $($_.Exception.Message)`n$($_.ScriptStackTrace)"
        Write-Host $errorMsg -ForegroundColor Red
        Add-Content -Path $logPath -Value $errorMsg -ErrorAction SilentlyContinue
    } else {
        Write-Host "ERROR during uninstall: $($_.Exception.Message)" -ForegroundColor Red
    }
}
