const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const SOURCE_ICON = path.join(__dirname, '..', '..', 'mobile', 'assets', 'icon.png');
const BUILD_DIR = path.join(__dirname, '..', 'build');
const APPX_DIR = path.join(BUILD_DIR, 'appx');

async function generateAssets() {
  console.log('Generating Windows Desktop and Store App assets from:', SOURCE_ICON);

  if (!fs.existsSync(APPX_DIR)) {
    fs.mkdirSync(APPX_DIR, { recursive: true });
  }

  // 1. High-res 512x512 and 256x256 for Windows Executable
  await sharp(SOURCE_ICON).resize(512, 512).png().toFile(path.join(BUILD_DIR, 'icon.png'));
  await sharp(SOURCE_ICON).resize(256, 256).png().toFile(path.join(BUILD_DIR, 'icon-256.png'));
  console.log('✔ Generated build/icon.png and build/icon-256.png');

  // 2. Windows App Store / MSIX Tiles
  // StoreLogo (50x50)
  await sharp(SOURCE_ICON).resize(50, 50).png().toFile(path.join(APPX_DIR, 'StoreLogo.png'));
  console.log('✔ Generated build/appx/StoreLogo.png (50x50)');

  // Square44x44Logo (44x44)
  await sharp(SOURCE_ICON).resize(44, 44).png().toFile(path.join(APPX_DIR, 'Square44x44Logo.png'));
  console.log('✔ Generated build/appx/Square44x44Logo.png (44x44)');

  // Square71x71Logo (71x71)
  await sharp(SOURCE_ICON).resize(71, 71).png().toFile(path.join(APPX_DIR, 'Square71x71Logo.png'));
  console.log('✔ Generated build/appx/Square71x71Logo.png (71x71)');

  // Square150x150Logo (150x150)
  await sharp(SOURCE_ICON).resize(150, 150).png().toFile(path.join(APPX_DIR, 'Square150x150Logo.png'));
  console.log('✔ Generated build/appx/Square150x150Logo.png (150x150)');

  // Square310x310Logo (310x310)
  await sharp(SOURCE_ICON).resize(310, 310).png().toFile(path.join(APPX_DIR, 'Square310x310Logo.png'));
  console.log('✔ Generated build/appx/Square310x310Logo.png (310x310)');

  // Wide310x150Logo (310x150 with centered square logo on #0B0F17 background)
  const wideLogoSquare = await sharp(SOURCE_ICON).resize(130, 130).toBuffer();
  await sharp({
    create: {
      width: 310,
      height: 150,
      channels: 4,
      background: { r: 11, g: 15, b: 23, alpha: 1 }
    }
  })
  .composite([{ input: wideLogoSquare, gravity: 'center' }])
  .png()
  .toFile(path.join(APPX_DIR, 'Wide310x150Logo.png'));
  console.log('✔ Generated build/appx/Wide310x150Logo.png (310x150)');

  // SplashScreen (620x300 with centered square logo on #0B0F17 background)
  const splashLogoSquare = await sharp(SOURCE_ICON).resize(200, 200).toBuffer();
  await sharp({
    create: {
      width: 620,
      height: 300,
      channels: 4,
      background: { r: 11, g: 15, b: 23, alpha: 1 }
    }
  })
  .composite([{ input: splashLogoSquare, gravity: 'center' }])
  .png()
  .toFile(path.join(APPX_DIR, 'SplashScreen.png'));
  console.log('✔ Generated build/appx/SplashScreen.png (620x300)');

  // 3. Generate multi-resolution Windows ICO file
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(icoSizes.map(s => sharp(SOURCE_ICON).resize(s, s).png().toBuffer()));
  
  // Construct Windows ICO binary
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type: 1 = ICO
  icoHeader.writeUInt16LE(icoSizes.length, 4); // Number of images

  let offset = 6 + (16 * icoSizes.length);
  const directoryEntries = [];

  for (let i = 0; i < icoSizes.length; i++) {
    const s = icoSizes[i];
    const buf = pngBuffers[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(s === 256 ? 0 : s, 0); // Width (0 means 256)
    entry.writeUInt8(s === 256 ? 0 : s, 1); // Height (0 means 256)
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(buf.length, 8); // Size of image data
    entry.writeUInt32LE(offset, 12); // Offset of image data
    directoryEntries.push(entry);
    offset += buf.length;
  }

  const icoBuffer = Buffer.concat([icoHeader, ...directoryEntries, ...pngBuffers]);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuffer);
  console.log('✔ Generated build/icon.ico with multi-res entries [16, 32, 48, 64, 128, 256]');

  // 4. Ensure bundled cloudflared.exe exists for packaging
  const cloudflaredDir = path.join(__dirname, '..', 'cloudflared');
  const cloudflaredExe = path.join(cloudflaredDir, 'cloudflared.exe');
  if (!fs.existsSync(cloudflaredExe)) {
    console.log('⬇ Bundled cloudflared.exe not found, downloading latest Windows 64-bit binary...');
    if (!fs.existsSync(cloudflaredDir)) fs.mkdirSync(cloudflaredDir, { recursive: true });
    const https = require('https');
    const dlUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(cloudflaredExe);
      const dl = (u) => {
        https.get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return dl(res.headers.location);
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
      };
      dl(dlUrl);
    });
    console.log('✔ Downloaded bundled cloudflared.exe successfully');
  } else {
    console.log('✔ Bundled cloudflared.exe is present');
  }

  console.log('\n🎉 All Windows App Store and Desktop executable assets ready in server/build/');
}

generateAssets().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
