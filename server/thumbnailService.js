const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('sharp library optional load warning:', e.message);
}
const DATA_DIR = process.env.NAS_DATA_DIR || __dirname;
const CACHE_DIR = path.join(DATA_DIR, '.nas_cache', 'thumbnails');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

const ALLOWED_IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.heic', '.heif', '.tif', '.tiff', '.avif'
]);

async function getOrGenerateThumbnail(filePath, size = 250) {
  if (!filePath || typeof filePath !== 'string') return null;
  ensureCacheDir();
  
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.has(ext)) {
    return null;
  }

  let mtimeMs = 0;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    mtimeMs = stat.mtimeMs;
  } catch (err) {
    return null;
  }

  const cacheKey = crypto.createHash('md5').update(`${filePath}_${mtimeMs}_${size}`).digest('hex') + '.webp';
  const cachePath = path.join(CACHE_DIR, cacheKey);

  // Return cached thumbnail if exists
  if (fs.existsSync(cachePath)) {
    return cachePath;
  }

  // Generate thumbnail using sharp if available
  if (sharp) {
    try {
      await sharp(filePath)
        .resize(size, size, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(cachePath);
      return cachePath;
    } catch (err) {
      console.warn('Thumbnail generation failed for:', filePath, err.message);
    }
  }

  // Security Hardening: Never return raw arbitrary file as thumbnail fallback
  return null;
}

module.exports = {
  getOrGenerateThumbnail
};
