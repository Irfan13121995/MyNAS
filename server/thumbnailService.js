const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('sharp library optional load warning:', e.message);
}

const CACHE_DIR = path.join(__dirname, '.nas_cache', 'thumbnails');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex') + '.webp';
}

async function getOrGenerateThumbnail(filePath, size = 250) {
  ensureCacheDir();
  const cacheKey = getCacheKey(filePath);
  const cachePath = path.join(CACHE_DIR, cacheKey);

  // Return cached thumbnail if exists
  if (fs.existsSync(cachePath)) {
    return cachePath;
  }

  // Generate thumbnail using sharp if available
  if (sharp && fs.existsSync(filePath)) {
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

  // Fallback: return original file path
  return filePath;
}

module.exports = {
  getOrGenerateThumbnail
};
