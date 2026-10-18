import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter } from '@heynixie/log';
import { recordSkillPin } from './record-skill-pin';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-skill-pin-record-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: dir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it pins the listed skills the definitions hold, in name order, and skips a name they lack', async () => {
  const ctx = await setupTest();

  const skills = await recordSkillPin(ctx.log, {
    thread: 'task-a',
    inForce: {
      snapshotHash: 'snapshot-a',
      personaVersion: 'persona-a',
      skills: [
        { name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' },
        { name: 'bird-log', skillHash: 'hash-b', origin: 'vendored' },
        { name: 'pdf-forms', skillHash: 'hash-c', origin: 'vendored' },
      ],
    },
    list: ['tide-tables', 'bird-log', 'star-chart'],
  });

  const pins = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.pinned'] });

  expect(skills).toStrictEqual([
    { name: 'bird-log', skillHash: 'hash-b', origin: 'vendored' },
    { name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' },
  ]);

  expect(pins.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'skills.pinned',
      thread: 'task-a',
      definitions: { snapshotHash: 'snapshot-a', personaVersion: 'persona-a' },
      payload: { skills },
    },
  ]);
});
