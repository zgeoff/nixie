import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMemoryHostState } from './read-memory-host-state';

test('#readMemoryHostState reads no state from a file that does not exist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-state-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  expect(readMemoryHostState(join(directory, 'missing.json'))).toBeNull();
});

test('#readMemoryHostState refuses a file that holds no state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-state-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const path = join(directory, 'host.json');

  await writeFile(path, '{"instance":1}');

  expect(() => readMemoryHostState(path)).toThrow();
});
