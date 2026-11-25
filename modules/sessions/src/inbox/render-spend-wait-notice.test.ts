import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { holdTaskOnRoute, readSpendFacts, settleRouteStops } from '@heynixie/spend';
import {
  buildMockGatewayStatus,
  buildTrippedGatewayStatus,
  startTestSpend,
} from '@heynixie/spend/test-utils';
import invariant from 'tiny-invariant';
import { buildMockTaskMessageView } from '../test-utils/build-mock-task-message-view';
import { renderInboxMessage } from './render-inbox-message';

async function setupTest() {
  const spend = await startTestSpend();

  // the mock gateway counts the day of 13 Nov 2026
  spend.clock.advance(28 * 86_400_000);

  return {
    ...spend,
    settle: async () => {
      const facts = await readSpendFacts(spend.context);

      await settleRouteStops(spend.context, facts);
    },
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

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    thread: 'task-a',
    kinds: ['spend.wait_notice'],
  });

  const record = records[0]?.record;

  invariant(record !== undefined, 'the clear writes a wait notice on the task thread');

  const message = renderInboxMessage(
    record,
    { defaultZone: 'UTC', now: new Date(ctx.clock.now()) },
    buildMockTaskMessageView(),
  );

  expect(message).toInclude(
    'This task waited about 5 min for a spending limit and has resumed. Nothing was lost.',
  );

  expect(message).not.toMatch(/\$|dollar|plan|41/u);
});
