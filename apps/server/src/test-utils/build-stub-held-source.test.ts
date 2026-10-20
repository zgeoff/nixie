import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource } from '@heynixie/definitions';
import { buildStubHeldSource } from './build-stub-held-source';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-held-source-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it holds the first snapshot until release, and lets a later snapshot return first', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'persona.md'), '# Persona\n');

  const stub = buildStubHeldSource(createPathSource({ directory: ctx.directory }));
  const first = stub.source.snapshot();

  const second = await stub.source.snapshot();

  const eventsBeforeRelease = [...stub.events];

  stub.release();

  const held = await first;

  expect(eventsBeforeRelease).toStrictEqual(['start', 'start', 'end']);
  expect(stub.events).toStrictEqual(['start', 'start', 'end', 'end']);
  expect(held.contentHash).toBe(second.contentHash);
});
