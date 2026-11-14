import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter } from '@heynixie/log';
import { recordSkillPin } from './record-skill-pin';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-pin-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it pins the listed skills in name order and records the pin', async () => {
  const ctx = await setupTest();

  const skills = await recordSkillPin(ctx.log, {
    thread: 'task-a',
    inForce: {
      snapshotHash: 'snapshot-a',
      personaVersion: 'persona-a',
      skills: [
        { name: 'tide-tables', skillHash: 'hash-tides', origin: 'definitions' },
        { name: 'bird-log', skillHash: 'hash-birds', origin: 'vendored' },
        { name: 'star-chart', skillHash: 'hash-stars', origin: 'definitions' },
      ],
    },
    list: ['tide-tables', 'bird-log', 'moon-phase'],
  });

  const pins = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.pinned'] });

  expect(skills).toStrictEqual([
    { name: 'bird-log', skillHash: 'hash-birds', origin: 'vendored' },
    { name: 'tide-tables', skillHash: 'hash-tides', origin: 'definitions' },
  ]);

  expect(pins.map((entry) => entry.record.payload)).toStrictEqual([
    {
      skills: [
        { name: 'bird-log', skillHash: 'hash-birds', origin: 'vendored' },
        { name: 'tide-tables', skillHash: 'hash-tides', origin: 'definitions' },
      ],
    },
  ]);
});

test('it gives 2 racing first pins of one thread the pin that committed, and records one', async () => {
  const ctx = await setupTest();

  const results = await Promise.all([
    recordSkillPin(ctx.log, {
      thread: 'task-a',
      inForce: {
        snapshotHash: 'snapshot-a',
        personaVersion: 'persona-a',
        skills: [{ name: 'tide-tables', skillHash: 'hash-old', origin: 'definitions' }],
      },
      list: ['tide-tables'],
    }),
    recordSkillPin(ctx.log, {
      thread: 'task-a',
      inForce: {
        snapshotHash: 'snapshot-b',
        personaVersion: 'persona-a',
        skills: [{ name: 'tide-tables', skillHash: 'hash-new', origin: 'definitions' }],
      },
      list: ['tide-tables'],
    }),
  ]);

  const pins = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.pinned'] });

  expect(pins).toHaveLength(1);
  expect(results[0]).toStrictEqual(results[1]);

  expect(pins.map((entry) => entry.record.payload)).toStrictEqual([
    {
      skills: results[0].map((skill) => ({
        name: skill.name,
        skillHash: skill.skillHash,
        origin: skill.origin,
      })),
    },
  ]);
});
