import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { holdTaskOnRoute, readSpendFacts, settleRouteStops } from '@heynixie/spend';
import {
  buildMockGatewayStatus,
  buildTrippedGatewayStatus,
  startTestSpend,
} from '@heynixie/spend/test-utils';
import { buildMockTaskMessageView } from '../test-utils/build-mock-task-message-view';
import { readTurnBatch } from '../turn/read-turn-batch';
import { inboxBatchLimit } from './inbox-batch-limit';

async function setupTest() {
  const spend = await startTestSpend();

  // the mock gateway counts the day of 13 Nov 2026
  spend.clock.advance(28 * 86_400_000);

  const settle = async () => {
    const facts = await readSpendFacts(spend.context);

    await settleRouteStops(spend.context, facts);
  };

  return {
    ...spend,
    readInbox: (inbox: Parameters<typeof readTurnBatch>[1]) =>
      readTurnBatch({ log: spend.log, readDefinitionVersion: () => Promise.resolve(null) }, inbox, {
        times: { defaultZone: 'UTC', now: new Date(spend.clock.now()) },
        view: buildMockTaskMessageView(),
        imageBudget: { bytes: 24 * 1024 * 1024, count: 100 },
      }),
    settle,
    readWaitNotices: () =>
      readRecords(spend.log, { afterSequence: 0, thread: 'task-a', kinds: ['spend.wait_notice'] }),
  };
}

test('it tells the model its next wake that it waited about so many minutes for a limit, with no dollar figure and no route', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  ctx.clock.advance(5 * 60_000);
  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.settle();

  const notices = await ctx.readWaitNotices();
  const batch = await ctx.readInbox(notices.map((notice) => notice.record));

  const message = batch.messages.map((entry) => entry.text).join('\n');

  expect(message).toInclude(
    'This task waited about 5 min for a spending limit and has resumed. Nothing was lost.',
  );

  expect(message).not.toMatch(/\$|dollar|plan|41/u);
});

test('it tells the model in the turn after a full batch of earlier messages, not never', async () => {
  const ctx = await setupTest();

  const earlier = await writeRecords(
    ctx.log,
    Array.from({ length: inboxBatchLimit }, (_, index) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: `Note ${index + 1}` },
    })),
  );

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  ctx.clock.advance(5 * 60_000);
  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.settle();

  const notices = await ctx.readWaitNotices();

  const inbox = [...earlier, ...notices.map((notice) => notice.record)];

  const first = await ctx.readInbox(inbox);
  const second = await ctx.readInbox(inbox.slice(first.records.length));

  expect(second.messages.map((entry) => entry.text).join('\n')).toInclude(
    'This task waited about 5 min',
  );
});
