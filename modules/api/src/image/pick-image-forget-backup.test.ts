import { expect, test } from 'bun:test';
import type { ForgetBackupState } from '../types';
import { pickImageForgetBackup } from './pick-image-forget-backup';

test.each<[string, ForgetBackupState[], ForgetBackupState]>([
  [
    'failed over every other state',
    [{ state: 'pending' }, { state: 'failed', failure: 'the store refused' }, { state: 'unknown' }],
    { state: 'failed', failure: 'the store refused' },
  ],
  ['unknown over pending', [{ state: 'pending' }, { state: 'unknown' }], { state: 'unknown' }],
  ['pending over complete', [{ state: 'complete' }, { state: 'pending' }], { state: 'pending' }],
  ['the shared state', [{ state: 'complete' }, { state: 'complete' }], { state: 'complete' }],
  ['off when backup is off', [{ state: 'off' }, { state: 'off' }], { state: 'off' }],
])('#pickImageForgetBackup picks %s', (_title, states, expected) => {
  expect(pickImageForgetBackup(states)).toStrictEqual(expected);
});
