import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { findSkillPin } from './find-skill-pin';
import { recordSkillPin } from './record-skill-pin';
import { recordSkillReload } from './record-skill-reload';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-skill-pin-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: dir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it reads the skills of the newest reload over an earlier pin', async () => {
  const ctx = await setupTest();

  await recordSkillPin(ctx.log, {
    thread: 'task-a',
    inForce: {
      snapshotHash: 'snapshot-a',
      personaVersion: 'persona-a',
      skills: [{ name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' }],
    },
    list: ['tide-tables'],
  });

  await recordSkillReload(ctx.log, {
    thread: 'task-a',
    inForce: { snapshotHash: 'snapshot-b', personaVersion: 'persona-a' },
    plan: {
      skills: [{ name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' }],
      changes: [{ name: 'tide-tables', oldHash: 'hash-a', newHash: 'hash-b' }],
    },
  });

  const pin = await findSkillPin(ctx.log, 'task-a');

  expect(pin).toStrictEqual([{ name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' }]);
});

test('it reads the skills of the newest of 2 reloads', async () => {
  const ctx = await setupTest();

  await recordSkillPin(ctx.log, {
    thread: 'task-a',
    inForce: {
      snapshotHash: 'snapshot-a',
      personaVersion: 'persona-a',
      skills: [{ name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' }],
    },
    list: ['tide-tables'],
  });

  await recordSkillReload(ctx.log, {
    thread: 'task-a',
    inForce: { snapshotHash: 'snapshot-b', personaVersion: 'persona-a' },
    plan: {
      skills: [{ name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' }],
      changes: [{ name: 'tide-tables', oldHash: 'hash-a', newHash: 'hash-b' }],
    },
  });

  await recordSkillReload(ctx.log, {
    thread: 'task-a',
    inForce: { snapshotHash: 'snapshot-c', personaVersion: 'persona-a' },
    plan: {
      skills: [{ name: 'bird-log', skillHash: 'hash-c', origin: 'vendored' }],
      changes: [
        { name: 'bird-log', oldHash: null, newHash: 'hash-c' },
        { name: 'tide-tables', oldHash: 'hash-b', newHash: null },
      ],
    },
  });

  const pin = await findSkillPin(ctx.log, 'task-a');

  expect(pin).toStrictEqual([{ name: 'bird-log', skillHash: 'hash-c', origin: 'vendored' }]);
});

test('it finds no pin for a thread whose only pin is on another thread', async () => {
  const ctx = await setupTest();

  await recordSkillPin(ctx.log, {
    thread: 'task-b',
    inForce: {
      snapshotHash: 'snapshot-a',
      personaVersion: 'persona-a',
      skills: [{ name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' }],
    },
    list: ['tide-tables'],
  });

  const pin = await findSkillPin(ctx.log, 'task-a');

  expect(pin).toBeNull();
});
