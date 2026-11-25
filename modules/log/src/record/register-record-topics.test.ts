import { expect, test } from 'bun:test';
import { buildLogSeeder } from '../test-utils/build-log-seeder';
import { startTestLog } from '../test-utils/start-test-log';
import { registerRecordTopics } from './register-record-topics';
import { subscribeToChanged } from './subscribe-to-changed';
import { writeRecords } from './write-records';

async function setupTest() {
  const testLog = await startTestLog();

  const changes: (readonly string[])[] = [];

  subscribeToChanged(testLog.writer, (topics) => {
    changes.push(topics);
  });

  return { ...testLog, changes, seed: buildLogSeeder(testLog) };
}

test('it sends the topics a registered record kind names when the record commits', async () => {
  const ctx = await setupTest();

  registerRecordTopics(ctx.writer, { owner_message: ['tasks', 'definitions'] });

  await ctx.seed.record({ kind: 'owner_message', thread: 'conversation' });

  expect(ctx.changes).toStrictEqual([['tasks', 'definitions']]);
});

test('it sends nothing for a kind that names no topic', async () => {
  const ctx = await setupTest();

  registerRecordTopics(ctx.writer, { owner_message: [] });

  await ctx.seed.record({ kind: 'owner_message', thread: 'conversation' });

  expect(ctx.changes).toStrictEqual([]);
});

test('it merges the topics of the records one write appends', async () => {
  const ctx = await setupTest();

  registerRecordTopics(ctx.writer, {
    owner_message: ['tasks'],
    'model.reply': ['tasks', 'memory'],
  });

  await writeRecords(ctx.log, [
    { kind: 'owner_message', thread: 'conversation', definitions: { snapshotHash: 'sha256:test' } },
    { kind: 'model.reply', thread: 'conversation', definitions: { snapshotHash: 'sha256:test' } },
  ]);

  expect(ctx.changes).toStrictEqual([['tasks', 'memory']]);
});

test('it refuses a second owner for one record kind', async () => {
  const ctx = await setupTest();

  registerRecordTopics(ctx.writer, { owner_message: ['tasks'] });

  expect(() => {
    registerRecordTopics(ctx.writer, { owner_message: ['memory'] });
  }).toThrow();
});
