import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter } from '@heynixie/log';
import { recordSkillReload } from './record-skill-reload';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-skill-reload-record-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: dir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it records the pin and each change on the task thread under the definitions it moved to', async () => {
  const ctx = await setupTest();

  await recordSkillReload(ctx.log, {
    thread: 'task-a',
    inForce: { snapshotHash: 'snapshot-b', personaVersion: 'persona-a' },
    plan: {
      skills: [{ name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' }],
      changes: [
        { name: 'bird-log', oldHash: 'hash-c', newHash: null },
        { name: 'tide-tables', oldHash: 'hash-a', newHash: 'hash-b' },
      ],
    },
  });

  const reloads = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.reloaded'] });

  expect(reloads.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'skills.reloaded',
      thread: 'task-a',
      definitions: { snapshotHash: 'snapshot-b', personaVersion: 'persona-a' },
      payload: {
        skills: [{ name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' }],
        changes: [
          { name: 'bird-log', oldHash: 'hash-c', newHash: null },
          { name: 'tide-tables', oldHash: 'hash-a', newHash: 'hash-b' },
        ],
      },
    },
  ]);
});
