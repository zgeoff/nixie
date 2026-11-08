import { expect, test } from 'bun:test';
import { pickForgetBackup } from './pick-forget-backup';

test.each([
  ['no set', []],
  ['a set that waits on its receipt', [{ sequence: 1, state: 'staged', receipt: null }]],
  ['a set still copying', [{ sequence: 1, state: 'staging', receipt: null }]],
  ['only an abandoned set', [{ sequence: 1, state: 'abandoned', receipt: null }]],
  [
    'a set that waits after a failed one',
    [
      { sequence: 2, state: 'staged', receipt: null },
      { sequence: 1, state: 'failed', receipt: '{}' },
    ],
  ],
] as const)('it picks pending for %s', (_label, sets) => {
  expect(pickForgetBackup(sets)).toStrictEqual({ state: 'pending' });
});

test.each([
  ['a published set', [{ sequence: 1, state: 'published', receipt: null }]],
  [
    'a published set under a newer failed one',
    [
      { sequence: 2, state: 'failed', receipt: '{}' },
      { sequence: 1, state: 'published', receipt: null },
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
    { sequence: 8, state: 'abandoned', receipt: null },
    { sequence: 7, state: 'failed', receipt },
  ]);

  expect(backup).toStrictEqual({ state: 'failed', failure: 'keys: prune exited 1' });
});

test('it picks failed with the refusal when nixie refused the receipt', () => {
  const backup = pickForgetBackup([{ sequence: 7, state: 'failed', receipt: 'not json' }]);

  expect(backup).toStrictEqual({
    state: 'failed',
    failure: expect.stringMatching(/^nixie refused the set's receipt: the file: /u),
  });
});

test.each([
  [
    'published',
    {
      status: 'published',
      dataSnapshotID: 'a'.repeat(64),
      keySnapshotID: 'b'.repeat(64),
      prune: 'passed',
      check: 'passed',
      failure: null,
    },
  ],
  [
    'failed',
    {
      status: 'failed',
      dataSnapshotID: null,
      keySnapshotID: null,
      prune: 'failed',
      check: 'not-run',
      failure: 'keys: prune exited 1',
    },
  ],
] as const)(
  'it picks failed with a refusal when a %s receipt for another set sat in the failed set',
  (_status, outcome) => {
    const receipt = JSON.stringify({
      format: 1,
      sequence: 9,
      writtenAt: 1_798_761_660_000,
      removedKeySnapshotIDs: [],
      ...outcome,
    });

    const backup = pickForgetBackup([{ sequence: 7, state: 'failed', receipt }]);

    expect(backup).toStrictEqual({
      state: 'failed',
      failure: "nixie refused the set's receipt: it names set 9",
    });
  },
);
