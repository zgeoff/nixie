import { expect, test } from 'bun:test';
import { spendWaitNoticeCodec, writeRecords } from '@heynixie/log';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readToldWaitNotices } from './read-told-wait-notices';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    writeNotice: () =>
      writeRecords(tasks.context.log, [
        {
          kind: 'spend.wait_notice',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          payload: spendWaitNoticeCodec.encode({
            shortID: 'k3vq8m2xpa',
            taskID: 'conversation',
            sinceMs: 0,
            untilMs: 60_000,
          }),
        },
      ]),
    writeTurnEnd: (payload: Record<string, unknown>) =>
      writeRecords(tasks.context.log, [
        {
          kind: 'model.turn_ended',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          payload: { stopReason: 'end_turn', ...payload },
        },
      ]),
  };
}

test('it reads the notices that any turn end after them told, though a later turn end told none', async () => {
  const ctx = await setupTest();

  const notices = [...(await ctx.writeNotice()), ...(await ctx.writeNotice())];
  const sequences = notices.map((record) => record.sequence);

  await ctx.writeTurnEnd({ waitNoticesTold: sequences });
  await ctx.writeTurnEnd({});

  const told = await readToldWaitNotices(ctx.context, 'conversation', notices);

  expect([...told]).toStrictEqual(sequences);
});

test('it reads no notice as told from a turn end written before turn ends told notices', async () => {
  const ctx = await setupTest();
  const notices = await ctx.writeNotice();

  await ctx.writeTurnEnd({});

  const told = await readToldWaitNotices(ctx.context, 'conversation', notices);

  expect([...told]).toStrictEqual([]);
});
