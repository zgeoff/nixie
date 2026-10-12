import { expect, test } from 'bun:test';
import { KeyStoreBusyError, writeKeyStoreCheckpoint } from '@heynixie/log';
import { createProposal } from './create-proposal';
import { startKeyStoreReader } from './start-key-store-reader';
import { startTestMemory } from './start-test-memory';

// a blocked checkpoint waits out the database's busy timeout before it reports the reader
test('it blocks a key store checkpoint while it holds its read', async () => {
  const memory = await startTestMemory();

  await createProposal(memory.store, { text: 'Likes jazz' });
  await startKeyStoreReader(memory.dataDir);

  expect(writeKeyStoreCheckpoint(memory.log, null)).rejects.toBeInstanceOf(KeyStoreBusyError);
}, 15_000);

test('it lets a key store checkpoint finish once released', async () => {
  const memory = await startTestMemory();

  await createProposal(memory.store, { text: 'Likes jazz' });

  const reader = await startKeyStoreReader(memory.dataDir);

  await reader.release();

  await expect(writeKeyStoreCheckpoint(memory.log, null)).toResolve();
});
