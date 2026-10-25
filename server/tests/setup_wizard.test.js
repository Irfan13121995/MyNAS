const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const driveConfig = require('../driveConfigService');

test('Setup Wizard: driveConfigService setAllowedPaths properly persists drives and custom storage paths', () => {
  const originalAllowed = driveConfig.getAllowedPaths();
  const originalCustom = driveConfig.getCustomPaths();

  try {
    const testDrives = ['D:', 'E:'];
    const testCustom = [
      {
        path: 'D:\\NAS_Storage',
        label: 'Primary NAS Storage',
        addedAt: new Date().toISOString()
      }
    ];

    const config = driveConfig.setAllowedPaths(testDrives, testCustom);
    assert.ok(config);
    assert.deepEqual(config.allowedPaths, ['D:', 'E:']);
    assert.equal(config.customPaths.length, 1);
    assert.equal(config.customPaths[0].path, 'D:\\NAS_Storage');

    const retrievedAllowed = driveConfig.getAllowedPaths();
    assert.deepEqual(retrievedAllowed, ['D:', 'E:']);

    const retrievedCustom = driveConfig.getCustomPaths();
    assert.equal(retrievedCustom.length, 1);
    assert.equal(retrievedCustom[0].path, 'D:\\NAS_Storage');
  } finally {
    driveConfig.setAllowedPaths(originalAllowed || ['I:', 'K:'], originalCustom || []);
  }
});

test('Storage Sync: driveConfig.syncWithDisks maintains RAID member disks and prunes offline disks', () => {
  const originalAllowed = driveConfig.getAllowedPaths();
  const originalCustom = driveConfig.getCustomPaths();

  try {
    driveConfig.setAllowedPaths(['D:', 'E:', '\\\\NAS\\share']);
    const synced = driveConfig.syncWithDisks(['I:', 'K:'], ['C:', 'I:', 'K:']);

    assert.ok(synced.some(p => p.toUpperCase().startsWith('I:')), 'Member disk I: must be present');
    assert.ok(synced.some(p => p.toUpperCase().startsWith('K:')), 'Member disk K: must be present');
    assert.ok(synced.some(p => p.includes('share')), 'Custom / UNC paths must be preserved');
    assert.ok(!synced.some(p => p.toUpperCase().startsWith('D:')), 'Phantom drive D: must be pruned');
    assert.ok(!synced.some(p => p.toUpperCase().startsWith('E:')), 'Phantom drive E: must be pruned');
  } finally {
    driveConfig.setAllowedPaths(originalAllowed || ['I:', 'K:'], originalCustom || []);
  }
});
