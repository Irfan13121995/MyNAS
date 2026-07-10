Get-WmiObject Win32_LogicalDisk | ForEach-Object {
    $disk = $_
    $driveLetter = $disk.DeviceID
    $driveType = $disk.DriveType
    $volumeName = $disk.VolumeName
    $size = $disk.Size
    $freeSpace = $disk.FreeSpace
    
    $isUsb = $false
    if ($driveType -eq 2) {
        $isUsb = $true
    } elseif ($driveType -eq 3) {
        try {
            $partition = Get-WmiObject -Query "Association of {Win32_LogicalDisk.DeviceID='$driveLetter'} where AssocClass=Win32_LogicalDiskToPartition" -ErrorAction SilentlyContinue
            if ($partition) {
                $partitionId = $partition.DeviceID
                $diskDrive = Get-WmiObject -Query "Association of {Win32_DiskPartition.DeviceID='$partitionId'} where AssocClass=Win32_DiskDriveToDiskPartition" -ErrorAction SilentlyContinue
                if ($diskDrive -and ($diskDrive.InterfaceType -eq 'USB' -or $diskDrive.Caption -match 'USB')) {
                    $isUsb = $true
                }
            }
        } catch {}
    }
    
    [PSCustomObject]@{
        letter = $driveLetter
        name = $volumeName
        size = $size
        freeSpace = $freeSpace
        type = $driveType
        isUsb = $isUsb
    }
} | ConvertTo-Json -Compress
