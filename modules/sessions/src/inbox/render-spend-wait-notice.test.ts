import { expect, test } from 'bun:test';
import { readRecords, spendWaitNoticeCodec } from '@heynixie/log';
import { holdTaskOnRoute, readSpendFacts, settleRouteStops } from '@heynixie/spend';
import {
  buildMockGatewayStatus,
  buildTrippedGatewayStatus,
  startTestSpend,
} from '@heynixie/spend/test-utils';
import invariant from 'tiny-invariant';
import { buildMockTaskMessageView } from '../test-utils/build-mock-task-message-view';
import { readTurnBatch } from '../turn/read-turn-batch';

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
    readInbox: (
      inbox: Parameters<typeof readTurnBatch>[1],
      toldWaitNotices: ReadonlySet<number> = new Set(),
    ) =>
      readTurnBatch({ log: spend.log, readDefinitionVersion: () => Promise.resolve(null) }, inbox, {
        times: { defaultZone: 'UTC', now: new Date(spend.clock.now()) },
        view: buildMockTaskMessageView(),
        imageBudget: { bytes: 24 * 1024 * 1024, count: 100 },
        toldWaitNotices,
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

  // the message's id is random hex, so a figure counts only as a whole word
  expect(message).not.toMatch(/\$|dollar|\bplan\b|\b41(?:\.2)?\b/u);

  // a row number is no ID for the model to read; the notice's short ID is, and it stays the same
  expect(message).not.toInclude(`[#${String(notices[0]?.record.sequence)}]`);

  invariant(notices[0] !== undefined, 'the notice was written');

  const shortID = spendWaitNoticeCodec.decode(notices[0].record.payload).shortID;

  const again = await ctx.readInbox(notices.map((notice) => notice.record));

  expect([message, again.messages.map((entry) => entry.text).join('\n')]).toSatisfyAll(
    (text: string) => text.includes(`[${shortID}] This task waited`),
  );
});

test("it takes a notice that a turn's opening told with no text, so the read cursor passes it", async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  ctx.clock.advance(5 * 60_000);
  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.settle();

  const notices = await ctx.readWaitNotices();

  const inbox = notices.map((notice) => notice.record);

  const batch = await ctx.readInbox(inbox, new Set(inbox.map((record) => record.sequence)));

  expect(batch).toStrictEqual({ records: inbox, messages: [], silent: inbox });
});
