import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMemoryHostState } from './read-memory-host-state';
import { writeMemoryHostState } from './write-memory-host-state';

test('#writeMemoryHostState writes a state that #readMemoryHostState reads back, bytes included', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-state-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const path = join(directory, 'nested', 'host.json');

  const state = {
    instance: 'abcd1234',
    inbox: [{ hostMessageID: 'host-abcd1234-1', receivedAt: 5000, raw: new Uint8Array([1, 2, 3]) }],
    sent: [{ hostMessageID: 'sent-abcd1234-1', raw: new Uint8Array([4, 5]) }],
  };

  writeMemoryHostState(path, state);

  expect(readMemoryHostState(path)).toStrictEqual(state);
});
