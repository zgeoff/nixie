import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { claimTask, createConversationTask, runTaskStep, writeInboxRecords } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildInputHash } from './build-input-hash';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import { writeClientAction } from './write-client-action';
import { writeConversationRetry } from './write-conversation-retry';

async function setupTest() {
  const api = await startTestAPI();

  const seedFailedTurn = async () => {
    await createConversationTask(api.context);

    await writeInboxRecords(api.context, [
      {
        kind: 'owner_message',
        definitions: api.context.definitions(),
        thread: 'conversation',
        erasable: { text: 'Is the library open late?' },
      },
    ]);

    const failed = await claimTask(api.context, { holder: 'step-runner', leaseMs: 60_000 });

    invariant(failed);

    await runTaskStep(api.context, failed, {
      runStep: () => Promise.reject(new Error('the provider is overloaded')),
      leaseMs: 60_000,
      maxStepErrors: 3,
      retryDelayMs: 30_000,
      maxRetryDelayMs: 300_000,
    });
  };

  const seedClientAction = (clientActionID: string, procedure: string, identityID: string) =>
    withWriteTransaction(api.writer, (tx) =>
      writeClientAction(tx, {
        clientActionID,
        procedure,
        identityID,
        inputHash: buildInputHash({}),
        result: { retriedAt: api.clock.now() },
        recordedAt: api.clock.now(),
      }),
    );

  return {
    ...api,
    readRevivals: () => readRecords(api.context.log, { afterSequence: 0, kinds: ['task.revived'] }),
    seed: {
      revokedCaller: async () => {
        await seedFailedTurn();

        const laptop = await createDeviceSession(api.context, 'laptop');

        await withWriteTransaction(api.writer, (tx) =>
          tx
            .$extendTables<APITables>()
            .updateTable('identities')
            .set({ revoked_at: api.clock.now() })
            .where('identity_id', '=', laptop.caller.identityID)
            .execute(),
        );

        return laptop.caller;
      },
      actionIDOfAnotherProcedure: async () => {
        await seedFailedTurn();

        const laptop = await createDeviceSession(api.context, 'laptop');

        await seedClientAction(
          '6d1f3b5a-7c9e-4a2b-8d0f-2e4a6c8b0d13',
          'conversation.forget',
          laptop.caller.identityID,
        );

        return laptop.caller;
      },
      actionIDOfAnotherIdentity: async () => {
        await seedFailedTurn();

        const phone = await createDeviceSession(api.context, 'phone');
        const laptop = await createDeviceSession(api.context, 'laptop');

        await seedClientAction(
          '6d1f3b5a-7c9e-4a2b-8d0f-2e4a6c8b0d13',
          'conversation.retry',
          phone.caller.identityID,
        );

        return laptop.caller;
      },
      nothingFailed: async () => {
        await createConversationTask(api.context);

        const laptop = await createDeviceSession(api.context, 'laptop');

        return laptop.caller;
      },
      failedTurn: async () => {
        await seedFailedTurn();

        const laptop = await createDeviceSession(api.context, 'laptop');

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
