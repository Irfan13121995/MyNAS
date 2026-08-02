const { exec } = require('child_process');
const path = require('path');

/**
 * Retrieves logical drives and detects if they are external USB drives.
 * @returns {Promise<Array<{letter: string, name: string, size: number, freeSpace: number, type: number, isUsb: boolean}>>}
 */
function getDrives() {
  return new Promise((resolve, reject) => {
    const psScript = `Get-WmiObject Win32_LogicalDisk | ForEach-Object { $disk = $_; $driveLetter = $disk.DeviceID; $driveType = $disk.DriveType; $volumeName = $disk.VolumeName; $size = $disk.Size; $freeSpace = $disk.FreeSpace; $isUsb = $false; if ($driveType -eq 2) { $isUsb = $true } elseif ($driveType -eq 3) { try { $partition = Get-WmiObject -Query "Association of {Win32_LogicalDisk.DeviceID='$driveLetter'} where AssocClass=Win32_LogicalDiskToPartition" -ErrorAction SilentlyContinue; if ($partition) { $partitionId = $partition.DeviceID; $diskDrive = Get-WmiObject -Query "Association of {Win32_DiskPartition.DeviceID='$partitionId'} where AssocClass=Win32_DiskDriveToDiskPartition" -ErrorAction SilentlyContinue; if ($diskDrive -and ($diskDrive.InterfaceType -eq 'USB' -or $diskDrive.Caption -match 'USB')) { $isUsb = $true } } } catch {} }; [PSCustomObject]@{ letter = $driveLetter; name = $volumeName; size = $size; freeSpace = $freeSpace; type = $driveType; isUsb = $isUsb } } | ConvertTo-Json -Compress`;
    const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      try {
        const output = stdout.trim();
        if (!output) {
          return resolve([]);
        }
        const data = JSON.parse(output);
        const drives = Array.isArray(data) ? data : [data];
        
        const formattedDrives = drives.map(d => ({
          letter: d.letter,
          name: d.name || 'Local Disk',
          size: d.size ? Number(d.size) : 0,
          freeSpace: d.freeSpace ? Number(d.freeSpace) : 0,
          type: Number(d.type),
          isUsb: !!d.isUsb
        }));
        
        resolve(formattedDrives);
      } catch (err) {
        reject(new Error(`Failed to parse drives output: ${err.message}. Raw output: ${stdout}`));
      }
    });
  });
}

module.exports = { getDrives };
