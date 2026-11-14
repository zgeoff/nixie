import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { buildSeeder } from './test-utils/build-seeder';
import { startTestAPI } from './test-utils/start-test-api';
import { writeConversationRetry } from './write-conversation-retry';

async function setupTest() {
  const api = await startTestAPI();

  const seed = buildSeeder(api);

  return {
    ...api,
    readRevivals: () => readRecords(api.context.log, { afterSequence: 0, kinds: ['task.revived'] }),
    seed: {
      ...seed,
      revokedCaller: async () => {
        await seed.failedConversationTurn();

        const laptop = await seed.revokedIdentity({ deviceName: 'laptop' });

        return laptop.caller;
      },
      actionIDOfAnotherProcedure: async () => {
        await seed.failedConversationTurn();

        const laptop = await seed.identity({ deviceName: 'laptop' });

        await seed.clientAction({
          clientActionID: '6d1f3b5a-7c9e-4a2b-8d0f-2e4a6c8b0d13',
          procedure: 'conversation.forget',
          identityID: laptop.caller.identityID,
        });

        return laptop.caller;
      },
      actionIDOfAnotherIdentity: async () => {
        await seed.failedConversationTurn();

        const phone = await seed.identity({ deviceName: 'phone' });
        const laptop = await seed.identity({ deviceName: 'laptop' });

        await seed.clientAction({
          clientActionID: '6d1f3b5a-7c9e-4a2b-8d0f-2e4a6c8b0d13',
          procedure: 'conversation.retry',
          identityID: phone.caller.identityID,
        });

        return laptop.caller;
      },
      nothingFailed: async () => {
        await createConversationTask(api.context);

        const laptop = await seed.identity({ deviceName: 'laptop' });

        return laptop.caller;
      },
      failedTurn: async () => {
        await seed.failedConversationTurn();

        const laptop = await seed.identity({ deviceName: 'laptop' });

        return laptop.caller;
      },
    },
  };
}

test('it retries the failed turn for a live identity', async () => {
  const ctx = await setupTest();
  const caller = await ctx.seed.failedTurn();

  const retried = await writeConversationRetry(ctx.context, caller, {
    clientActionID: '6d1f3b5a-7c9e-4a2b-8d0f-2e4a6c8b0d13',
  });

  expect(retried).toStrictEqual({ status: 'retried', retriedAt: ctx.clock.now() });
});

test.each([
  ['from a revoked identity', 'revokedCaller', 'unauthorized'],
  ['with an action ID that another procedure used', 'actionIDOfAnotherProcedure', 'reused'],
  ['with an action ID that another identity used', 'actionIDOfAnotherIdentity', 'reused'],
  ['when the last turn did not fail', 'nothingFailed', 'nothing_to_retry'],
] as const)('it refuses a retry %s, and revives nothing', async (_, state, status) => {
  const ctx = await setupTest();
  const caller = await ctx.seed[state]();

  const retried = await writeConversationRetry(ctx.context, caller, {
    clientActionID: '6d1f3b5a-7c9e-4a2b-8d0f-2e4a6c8b0d13',
  });

  const revivals = await ctx.readRevivals();

  expect({ retried, revivals }).toStrictEqual({ retried: { status }, revivals: [] });
});
