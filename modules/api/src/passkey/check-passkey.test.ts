import { expect, test } from 'bun:test';
import {
  buildActionSeeder,
  createTestStep,
  seedActionRiskClass,
} from '@heynixie/actions/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { seedPasskey } from '../test-utils/seed-passkey';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';
import { alwaysAskKinds } from './always-ask-kinds';
import { isPasskeyWindowOpen } from './is-passkey-window-open';
import { openPasskeyWindow } from './open-passkey-window';
import { createPasskeyState } from './passkey-state';

async function setupTest() {
  const origin = 'https://nixie.example.org';

  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');
  const phone = await createDeviceSession(api.context, 'phone');

  const client = buildTestClient(api.url, laptop.token, origin);
  const phoneClient = buildTestClient(api.url, phone.token, origin);
  const seeder = buildActionSeeder({ context: api.context });

  const passkey = await seedPasskey(api.context, { caller: laptop.caller });

  const createAlwaysAskUnknown = async () => {
    const step = await createTestStep(api.context);

    const action = await seeder.unknownAction({
      step,
      arguments: { to: 'team', text: 'Boat is ready' },
    });

    await seedActionRiskClass(api.writer, action.action_id, 'always_ask');

    return action.action_id;
  };

  return {
    api,
    laptop,
    client,
    phoneClient,
    createAlwaysAskUnknown,
    tap: async (actionID: string) => {
      const issued = await client.passkeys.challenge({
        for: { kind: 'unknown_outcome', actionID, choice: 'retry' },
      });

      await client.approvals.answerUnknownOutcome({
        actionID,
        choice: 'retry',
        clientActionID: crypto.randomUUID(),
        passkey: await passkey.authenticator.assert(issued.options, { origin }),
      });
    },
    retry: (target: typeof client, actionID: string) =>
      target.approvals.answerUnknownOutcome({
        actionID,
        choice: 'retry',
        clientActionID: crypto.randomUUID(),
      }),
  };
}

test('#checkPasskey passes a second check of the same session within 10 minutes with no assertion', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();

  await ctx.tap(first);

  ctx.api.clock.advance(9 * 60 * 1000);

  const retried = await ctx.retry(ctx.client, second);

  expect(retried).toStrictEqual({ actionID: second, choice: 'retry' });
});

test('#checkPasskey asks again of the same session after 10 minutes', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();

  await ctx.tap(first);

  ctx.api.clock.advance(10 * 60 * 1000);

  expect(ctx.retry(ctx.client, second)).rejects.toMatchObject({ code: 'PASSKEY_REQUIRED' });
});

test('#checkPasskey asks again of another session after a tap', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();

  await ctx.tap(first);

  expect(ctx.retry(ctx.phoneClient, second)).rejects.toMatchObject({ code: 'PASSKEY_REQUIRED' });
});

test('#checkPasskey asks with no window open before any tap', async () => {
  const ctx = await setupTest();
  const action = await ctx.createAlwaysAskUnknown();

  await ctx.client.approvals.listItems();

  expect(ctx.retry(ctx.client, action)).rejects.toMatchObject({ code: 'PASSKEY_REQUIRED' });
});

test('#openPasskeyWindow keeps the window length the settings give', () => {
  const clock = createFakeClock();
  const passkeys = createPasskeyState();
  const context = { clock, passkeys, settings: { ...defaultAPISettings, passkeyWindowMs: 60_000 } };
  const binding = { kind: 'unknown_outcome', actionID: 'a1', choice: 'retry' } as const;

  openPasskeyWindow(context, 'session-1');

  clock.advance(59_000);

  const inside = isPasskeyWindowOpen(context, 'session-1', binding);

  clock.advance(1000);

  const outside = isPasskeyWindowOpen(context, 'session-1', binding);

  expect([inside, outside]).toStrictEqual([true, false]);
});

test('#defaultAPISettings gives the window a default of 10 minutes', () => {
  expect(defaultAPISettings.passkeyWindowMs).toBe(10 * 60 * 1000);
});

test('#alwaysAskKinds lists adding and removing a passkey and nothing else', () => {
  expect([...alwaysAskKinds]).toStrictEqual(['register', 'revoke']);
});

test('#checkPasskey asks for a registration after a tap, because adding a passkey always asks', async () => {
  const ctx = await setupTest();
  const action = await ctx.createAlwaysAskUnknown();

  await ctx.tap(action);

  const registration = ctx.client.passkeys.registrationOptions({});

  expect(registration).rejects.toMatchObject({ code: 'CODE_REQUIRED' });
});

test('#passkeys.window reports an open window for an answer and never for adding or removing a passkey', async () => {
  const ctx = await setupTest();
  const action = await ctx.createAlwaysAskUnknown();

  await ctx.tap(action);

  const asks = [
    { kind: 'unknown_outcome' as const, actionID: 'a1', choice: 'retry' as const },
    { kind: 'register' as const },
    { kind: 'revoke' as const, passkeyID: 'p1' },
  ];

  const reports = await Promise.all(
    asks.map((binding) => ctx.client.passkeys.window({ for: binding })),
  );

  expect(reports).toStrictEqual([{ isOpen: true }, { isOpen: false }, { isOpen: false }]);
});

test('#passkeys.revoke refuses a revoke that carries no assertion for it, even in an open window', async () => {
  const ctx = await setupTest();
  const action = await ctx.createAlwaysAskUnknown();

  await ctx.tap(action);

  const other = await createDeviceSession(ctx.api.context, 'tablet');
  const spare = await seedPasskey(ctx.api.context, { caller: other.caller });

  const issued = await ctx.client.passkeys.challenge({
    for: { kind: 'unknown_outcome', actionID: action, choice: 'retry' },
  });

  const revocation = ctx.client.passkeys.revoke({
    clientActionID: crypto.randomUUID(),
    passkeyID: spare.passkeyID,
    passkey: await spare.authenticator.assert(issued.options, {
      origin: 'https://nixie.example.org',
    }),
  });

  expect(revocation).rejects.toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'binding' } });
});

test('#sessions.signOut ends the window of the session', async () => {
  const ctx = await setupTest();
  const action = await ctx.createAlwaysAskUnknown();

  const binding = { kind: 'unknown_outcome', actionID: 'a1', choice: 'retry' } as const;

  await ctx.tap(action);

  const before = isPasskeyWindowOpen(ctx.api.context, ctx.laptop.sessionID, binding);

  await ctx.client.sessions.signOut({});

  const after = isPasskeyWindowOpen(ctx.api.context, ctx.laptop.sessionID, binding);

  expect([before, after]).toStrictEqual([true, false]);
});
