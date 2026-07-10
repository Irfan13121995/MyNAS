const { exec } = require('child_process');
const path = require('path');

/**
 * Retrieves logical drives and detects if they are external USB drives.
 * @returns {Promise<Array<{letter: string, name: string, size: number, freeSpace: number, type: number, isUsb: boolean}>>}
 */
function getDrives() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'detect_drives.ps1');
    // Run the powershell script bypassing the script execution policy
    const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;

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
