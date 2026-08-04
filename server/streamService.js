const fs = require('fs');
const path = require('path');
const { validatePath } = require('./fileService');

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.json': 'application/json',
  '.zip': 'application/zip'
};

/**
 * Streams a file supporting HTTP Range requests for media players.
 * @param {string} filePath Absolute file path to stream.
 * @param {import('express').Request} req Express Request object.
 * @param {import('express').Response} res Express Response object.
 */
async function streamFile(filePath, req, res) {
  try {
    const validatedPath = await validatePath(filePath);
    
    // Get file statistics
    const stat = await fs.promises.stat(validatedPath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot stream a directory path' });
    }
    const fileSize = stat.size;
    const range = req.headers.range;

    // Enable seeking / range support
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Determine content type based on extension
    const ext = path.extname(validatedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    if (range) {
      // Parse Range header format: "bytes=start-end"
      const parts = range.replace(/bytes=/, "").split("-");
      let start = parts[0] ? parseInt(parts[0], 10) : 0;
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (isNaN(start)) start = Math.max(0, fileSize - (end || 0));
      if (isNaN(end) || end >= fileSize) end = fileSize - 1;

      // Validate range constraints
      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        return res.end();
      }

      const chunkSize = (end - start) + 1;
      const fileStream = fs.createReadStream(validatedPath, { start, end });
      
      fileStream.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) res.status(500).end();
      });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunkSize,
      });
      
      fileStream.pipe(res);
      
      // Cleanup stream if client aborts the connection (e.g. skips forward in video)
      req.on('close', () => {
        fileStream.destroy();
      });
    } else {
      res.writeHead(200, { 'Content-Length': fileSize });
      const fileStream = fs.createReadStream(validatedPath);
      fileStream.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) res.status(500).end();
      });
      fileStream.pipe(res);
      
      req.on('close', () => {
        fileStream.destroy();
      });
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: `Streaming failed: ${err.message}` });
    }
  }
}

module.exports = { streamFile };
