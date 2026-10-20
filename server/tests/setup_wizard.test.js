const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const driveConfig = require('../driveConfigService');

test('Setup Wizard: driveConfigService setAllowedPaths properly persists drives and custom storage paths', () => {
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
});
