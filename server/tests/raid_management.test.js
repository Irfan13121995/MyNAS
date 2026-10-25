const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../dbService');

test('RAID Management: updateVolume and deleteVolume handle lifecycle correctly', () => {
  const testId = 'vol_unit_test_' + Date.now();
  db.createVolume({
    id: testId,
    name: 'Unit Test Array',
    raidLevel: 'RAID 1',
    memberDisks: ['I:', 'K:'],
    usableCapacityBytes: 1000000000,
    usableCapacityFormatted: '1.00 GB',
    mountPoint: 'I:\\UnitTestMount',
    devicePath: '\\\\.\\UnitTest'
  });

  const created = db.getVolumeById(testId);
  assert.ok(created);
  assert.equal(created.name, 'Unit Test Array');

  const updated = db.updateVolume(testId, {
    name: 'Renamed Unit Test Array',
    mountPoint: 'I:\\RenamedMount'
  });
  assert.ok(updated);
  assert.equal(updated.name, 'Renamed Unit Test Array');
  assert.equal(updated.mount_point, 'I:\\RenamedMount');

  const result = db.deleteVolume(testId);
  assert.equal(result.changes, 1);
  assert.equal(db.getVolumeById(testId), undefined);
});
