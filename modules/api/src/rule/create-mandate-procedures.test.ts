import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { createMandateProcedures } from './create-mandate-procedures';

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const procedures = createMandateProcedures({
    ...api.context,
    runInForceSeed: () => Promise.resolve(),
  });

  return {
    readCode: async (call: Promise<unknown>) => {
      try {
        await call;
      } catch (error) {
        if (error instanceof ORPCError) {
          const code: unknown = error.code;

          return typeof code === 'string' ? code : null;
        }

        return null;
      }

      return null;
    },
    client: createRouterClient(procedures, {
      context: { sessionToken: laptop.token, tokenSource: 'bearer' },
    }),
  };
}

test('#proposeMandate refuses a client action ID reused with other rules of the same count', async () => {
  const ctx = await setupTest();

  const clientActionID = crypto.randomUUID();

  await ctx.client.proposeMandate({
    title: 'Test sends',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
    clientActionID,
  });

  const code = await ctx.readCode(
    ctx.client.proposeMandate({
      title: 'Test sends',
      rules: [{ outcome: 'allow', tools: ['test.delete'] }],
      clientActionID,
    }),
  );

  expect(code).toBe('CLIENT_ACTION_ID_REUSED');
});

test('#proposeMandate replays the same request under the same client action ID', async () => {
  const ctx = await setupTest();

  const input = {
    title: 'Test sends',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
    clientActionID: crypto.randomUUID(),
  };

  const first = await ctx.client.proposeMandate(input);
  const second = await ctx.client.proposeMandate(input);

  expect(second).toStrictEqual(first);
});
