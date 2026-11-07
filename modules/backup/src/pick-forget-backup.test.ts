import { expect, test } from 'bun:test';
import { pickForgetBackup } from './pick-forget-backup';

test.each([
  ['no set', []],
  ['a set that waits on its receipt', [{ state: 'staged', receipt: null }]],
  ['a set still copying', [{ state: 'staging', receipt: null }]],
  ['only an abandoned set', [{ state: 'abandoned', receipt: null }]],
  [
    'a set that waits after a failed one',
    [
      { state: 'staged', receipt: null },
      { state: 'failed', receipt: '{}' },
    ],
  ],
] as const)('it picks pending for %s', (_label, sets) => {
  expect(pickForgetBackup(sets)).toStrictEqual({ state: 'pending' });
});

test.each([
  ['a published set', [{ state: 'published', receipt: null }]],
  [
    'a published set under a newer failed one',
    [
      { state: 'failed', receipt: '{}' },
      { state: 'published', receipt: null },
    ],
  ],
] as const)('it picks complete for %s', (_label, sets) => {
  expect(pickForgetBackup(sets)).toStrictEqual({ state: 'complete' });
});

test('it picks failed with the receipt failure when the newest set failed', () => {
  const receipt = JSON.stringify({
    format: 1,
    sequence: 7,
    writtenAt: 1_798_761_660_000,
    status: 'failed',
    dataSnapshotID: null,
    keySnapshotID: null,
    removedKeySnapshotIDs: [],
    prune: 'failed',
    check: 'not-run',
    failure: 'keys: prune exited 1',
  });

  const backup = pickForgetBackup([
    { state: 'abandoned', receipt: null },
    { state: 'failed', receipt },
  ]);

  expect(backup).toStrictEqual({ state: 'failed', failure: 'keys: prune exited 1' });
});

test('it picks failed with the refusal when nixie refused the receipt', () => {
  const backup = pickForgetBackup([{ state: 'failed', receipt: 'not json' }]);

  expect(backup).toStrictEqual({
    state: 'failed',
    failure: expect.stringMatching(/^nixie refused the set's receipt: the file: /u),
  });
});

test('it picks failed with a refusal when a published receipt sat in the failed set', () => {
  const receipt = JSON.stringify({
    format: 1,
    sequence: 8,
    writtenAt: 1_798_761_660_000,
    status: 'published',
    dataSnapshotID: 'a'.repeat(64),
    keySnapshotID: 'b'.repeat(64),
    removedKeySnapshotIDs: [],
    prune: 'passed',
    check: 'passed',
    failure: null,
  });

  const backup = pickForgetBackup([{ state: 'failed', receipt }]);

  expect(backup).toStrictEqual({
    state: 'failed',
    failure: "nixie refused the set's receipt: it names another set",
  });
});
