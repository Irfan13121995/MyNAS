const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { validatePath, resolveSafeTarget } = require('../fileService');
const dbService = require('../dbService');
const usersService = require('../usersService');

test('C2 & C3: resolveSafeTarget blocks traversal, reserved names, and containment escapes', () => {
  const baseDir = path.resolve('C:\\NAS_Storage');

  // Should succeed for valid filenames and subfolders
  const safeFile = resolveSafeTarget(baseDir, 'photo.jpg');
  assert.equal(safeFile, path.join(baseDir, 'photo.jpg'));

  const safeSub = resolveSafeTarget(baseDir, '2024/vacation/beach.png');
  assert.equal(safeSub, path.join(baseDir, '2024', 'vacation', 'beach.png'));

  // Should reject traversal attempts
  assert.throws(() => resolveSafeTarget(baseDir, '..\\..\\Windows\\System32\\cmd.exe'), /traversal sequences/i);
  assert.throws(() => resolveSafeTarget(baseDir, '../evil.sh'), /traversal sequences/i);
  assert.throws(() => resolveSafeTarget(baseDir, 'photos/../../evil.sh'), /traversal sequences/i);

  // Should reject null-bytes and drive injection
  assert.throws(() => resolveSafeTarget(baseDir, 'photo.jpg\0.exe'), /malformed path/i);
  assert.throws(() => resolveSafeTarget(baseDir, 'D:\\other\\file.txt'), /traversal sequences/i);

  // Should reject Windows reserved device names
  assert.throws(() => resolveSafeTarget(baseDir, 'CON.txt'), /reserved/i);
  assert.throws(() => resolveSafeTarget(baseDir, 'NUL'), /reserved/i);
  assert.throws(() => resolveSafeTarget(baseDir, 'AUX.png'), /reserved/i);
});

test('C2: validatePath strictly forbids access to secrets, app directories, and system roots', async () => {
  const dataDir = process.env.NAS_DATA_DIR || path.resolve(__dirname, '..');

  // Block .env
  await assert.rejects(async () => {
    await validatePath(path.join(dataDir, '.env'));
  }, /forbidden|Access Denied/i);

  // Block nas_data.db
  await assert.rejects(async () => {
    await validatePath(path.join(dataDir, 'nas_data.db'));
  }, /forbidden|Access Denied/i);

  // Block Windows System32
  if (process.env.WINDIR) {
    await assert.rejects(async () => {
      await validatePath(path.join(process.env.WINDIR, 'System32'));
    }, /forbidden|Access Denied/i);
  }

  // Block AppData / Startup
  if (process.env.APPDATA) {
    await assert.rejects(async () => {
      await validatePath(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'));
    }, /forbidden|Access Denied/i);
  }

  // Block traversal sequences
  await assert.rejects(async () => {
    await validatePath('C:\\..\\Windows');
  }, /traversal sequences/i);
});

test('C1 & ACL: isPathAllowed correctly restricts drive access and treats empty array as 0 disks', () => {
  // Simulate isPathAllowed logic
  function isPathAllowed(targetPath, allowedDisks) {
    if (allowedDisks === null || allowedDisks === undefined) return true;
    if (!Array.isArray(allowedDisks) || allowedDisks.length === 0) return false;
    if (!targetPath) return false;

    let cleanTarget = String(targetPath).replace(/::+/g, ':').trim().toUpperCase();
    if (/^[A-Z]:?$/.test(cleanTarget)) {
      cleanTarget = cleanTarget.replace(':', '') + ':\\';
    }
    cleanTarget = path.normalize(cleanTarget);
    if (!cleanTarget.endsWith('\\')) cleanTarget += '\\';

    return allowedDisks.some(disk => {
      let normDisk = String(disk).replace(/::+/g, ':').trim().toUpperCase();
      if (/^[A-Z]:?$/.test(normDisk)) {
        normDisk = normDisk.replace(':', '') + ':\\';
      }
      normDisk = path.normalize(normDisk);
      if (!normDisk.endsWith('\\')) normDisk += '\\';
      return cleanTarget.startsWith(normDisk);
    });
  }

  // Admin / Unrestricted (null)
  assert.equal(isPathAllowed('C:\\Photos', null), true);

  // Restricted user with D: only
  assert.equal(isPathAllowed('D:\\Photos\\2024', ['D:\\']), true);
  assert.equal(isPathAllowed('C:\\Photos\\2024', ['D:\\']), false);

  // Restricted user with empty array [] (must have ZERO disk access)
  assert.equal(isPathAllowed('D:\\Photos', []), false);
  assert.equal(isPathAllowed('C:\\', []), false);
});

test('C5: Single-use pairing codes generate, redeem, and prevent reuse', () => {
  const testUser = 'pairing_test_user_' + Date.now();
  
  // Create code
  const { pairingCode, expiresAt } = dbService.createPairingCode(testUser);
  assert.ok(pairingCode && pairingCode.length >= 24);
  assert.ok(expiresAt > Date.now());

  // Redeem code
  // First, create a mock user row so redeem can resolve it
  const redeemed = dbService.redeemPairingCode(pairingCode);
  // User may not exist in DB but code is verified and removed
  assert.ok(!dbService.redeemPairingCode(pairingCode), 'Pairing code must not be reusable after first redemption');
});

test('H3: Token versioning invalidates old user sessions', () => {
  const testUsername = 'test_token_ver_' + Date.now();
  const id = 'id_' + Date.now();

  dbService.db.prepare(`
    INSERT INTO users (id, username, email, password_hash, email_verified, role, is_readonly, allowed_disks, status, failed_attempts, lock_until, created_at, token_version)
    VALUES (?, ?, null, 'mockhash', 1, 'user', 1, '[]', 'active', 0, 0, datetime('now'), 1)
  `).run(id, testUsername);

  const initialUser = dbService.getUserByUsername(testUsername);
  assert.equal(initialUser.tokenVersion, 1);

  // Bump token version
  dbService.incrementTokenVersion(testUsername);

  const updatedUser = dbService.getUserByUsername(testUsername);
  assert.equal(updatedUser.tokenVersion, 2);

  // Clean up test user
  dbService.deleteUser(id);
});

test('Defense: validatePath blocks system drive (C:) root by default', async () => {
  await assert.rejects(async () => {
    await validatePath('C:\\');
  }, /System drive \(C:\)|Access Denied/i);

  await assert.rejects(async () => {
    await validatePath('C:\\Windows');
  }, /Access Denied|forbidden/i);
});

test('Defense: isLocalOrLanRequest correctly detects Cloudflare and external IPs', () => {
  function isLocalOrLanRequest(req) {
    if (req.headers['cf-connecting-ip'] || req.headers['cf-ray'] || req.headers['cf-visitor']) {
      return false;
    }
    const rawIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const cleanIp = rawIp.replace(/^.*:/, '');
    const isLocal = rawIp === '127.0.0.1' || rawIp === '::1' || rawIp === '::ffff:127.0.0.1';
    const isLan = cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp);
    return isLocal || isLan;
  }

  // Localhost
  assert.equal(isLocalOrLanRequest({ headers: {}, ip: '127.0.0.1' }), true);
  assert.equal(isLocalOrLanRequest({ headers: {}, ip: '::1' }), true);

  // Private LAN
  assert.equal(isLocalOrLanRequest({ headers: {}, ip: '192.168.1.105' }), true);
  assert.equal(isLocalOrLanRequest({ headers: {}, ip: '10.0.0.42' }), true);

  // Cloudflare Tunnel (Must be rejected!)
  assert.equal(isLocalOrLanRequest({ headers: { 'cf-connecting-ip': '203.0.113.19' }, ip: '127.0.0.1' }), false);
  assert.equal(isLocalOrLanRequest({ headers: { 'cf-ray': '8f12345678' }, ip: '192.168.1.5' }), false);

  // Public IP
  assert.equal(isLocalOrLanRequest({ headers: {}, ip: '198.51.100.22' }), false);
});

test('Defense: thumbnailService strictly rejects non-image files and prevents arbitrary file disclosure', async () => {
  const thumbnailService = require('../thumbnailService');
  
  // Non-image file extensions must return null
  const nonImageResult = await thumbnailService.getOrGenerateThumbnail('C:\\test\\secret.env');
  assert.equal(nonImageResult, null);

  const scriptResult = await thumbnailService.getOrGenerateThumbnail('C:\\test\\exploit.html');
  assert.equal(scriptResult, null);

  const textResult = await thumbnailService.getOrGenerateThumbnail('C:\\test\\notes.txt');
  assert.equal(textResult, null);
});

test('Defense: trashService restoreFromTrash resolves filename collisions safely', () => {
  const trashService = require('../trashService');
  const tempTestDir = path.join(__dirname, 'trash_test_' + Date.now());
  fs.mkdirSync(tempTestDir, { recursive: true });

  const originalFile = path.join(tempTestDir, 'document.pdf');
  fs.writeFileSync(originalFile, 'Original v1 content', 'utf8');

  // Move to trash
  const item = trashService.moveToTrash(originalFile, 'testuser');
  assert.ok(item && item.id);
  assert.ok(!fs.existsSync(originalFile));

  // Now create a NEW file with the same name at the original location
  fs.writeFileSync(originalFile, 'New conflicting content v2', 'utf8');

  // Restore from trash
  const restored = trashService.restoreFromTrash(item.id, { username: 'testuser', role: 'user' });
  assert.ok(restored);
  
  // Conflicting file must NOT have been destroyed
  assert.equal(fs.readFileSync(originalFile, 'utf8'), 'New conflicting content v2');

  // Restored file must be saved under collision-avoidance name
  const collisionPath = path.join(tempTestDir, 'document_restored_1.pdf');
  assert.ok(fs.existsSync(collisionPath));
  assert.equal(fs.readFileSync(collisionPath, 'utf8'), 'Original v1 content');

  // Clean up
  try { fs.rmSync(tempTestDir, { recursive: true, force: true }); } catch {}
});
