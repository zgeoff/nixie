import { expect, test } from 'bun:test';
import {
  buildActionSeeder,
  createTestStep,
  readTestAction,
  seedActionRiskClass,
} from '@heynixie/actions/test-utils';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { seedPasskey } from '../test-utils/seed-passkey';
import { startTestAPI } from '../test-utils/start-test-api';

async function setupTest() {
  const origin = 'https://nixie.example.org';

  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token, origin);
  const seeder = buildActionSeeder({ context: api.context });

  return {
    api,
    laptop,
    client,
    origin,
    createUnknown: async () => {
      const step = await createTestStep(api.context);

      return seeder.unknownAction({ step, arguments: { to: 'team', text: 'Boat is ready' } });
    },
    markAlwaysAsk: (actionID: string) => seedActionRiskClass(api.writer, actionID, 'always_ask'),
    readStatus: async (actionID: string) => {
      const action = await readTestAction(api.writer, actionID);

      return action.status;
    },
    listUnknown: async () => {
      const listed = await client.approvals.listItems();

      return listed.items.filter((entry) => entry.group === 'unknown_outcome');
    },
  };
}

test('#approvals.listItems lists an action that waits on the owner with what it did', async () => {
  const ctx = await setupTest();
  const action = await ctx.createUnknown();
  const [item] = await ctx.listUnknown();

  expect({
    actionID: item?.action.actionID,
    tool: item?.action.tool,
    fields: item?.action.fields,
    reason: item?.action.reason,
    attempts: item?.action.attempts.length,
    choices: item?.choices,
    passkeyChoices: item?.passkeyChoices,
  }).toStrictEqual({
    actionID: action.action_id,
    tool: 'test.send',
    fields: { to: 'team', text: 'Boat is ready' },
    reason: 'no_reconcile',
    attempts: 1,
    choices: ['happened', 'retry', 'drop'],
    passkeyChoices: [],
  });
});

test('#approvals.answerUnknownOutcome settles the action as done on it happened', async () => {
  const ctx = await setupTest();
  const action = await ctx.createUnknown();

  await ctx.client.approvals.answerUnknownOutcome({
    actionID: action.action_id,
    choice: 'happened',
    clientActionID: crypto.randomUUID(),
  });

  const status = await ctx.readStatus(action.action_id);

  expect(status).toBe('done');
});

test('#approvals.answerUnknownOutcome fails the action as dropped on drop', async () => {
  const ctx = await setupTest();
  const action = await ctx.createUnknown();

  await ctx.client.approvals.answerUnknownOutcome({
    actionID: action.action_id,
    choice: 'drop',
    clientActionID: crypto.randomUUID(),
  });

  const status = await ctx.readStatus(action.action_id);

  expect(status).toBe('failed');
});

test('#approvals.answerUnknownOutcome returns the action to pending on retry and lists it no more', async () => {
  const ctx = await setupTest();
  const action = await ctx.createUnknown();

  await ctx.client.approvals.answerUnknownOutcome({
    actionID: action.action_id,
    choice: 'retry',
    clientActionID: crypto.randomUUID(),
  });

  const status = await ctx.readStatus(action.action_id);
  const listed = await ctx.listUnknown();

  expect([status, listed]).toStrictEqual(['pending', []]);
});

test('#approvals.answerUnknownOutcome refuses a second answer with NOT_ALLOWED', async () => {
  const ctx = await setupTest();
  const action = await ctx.createUnknown();

  await ctx.client.approvals.answerUnknownOutcome({
    actionID: action.action_id,
    choice: 'drop',
    clientActionID: crypto.randomUUID(),
  });

  const second = ctx.client.approvals.answerUnknownOutcome({
    actionID: action.action_id,
    choice: 'happened',
    clientActionID: crypto.randomUUID(),
  });

  expect(second).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
});

test('#approvals.answerUnknownOutcome settles a repeated client action ID once', async () => {
  const ctx = await setupTest();
  const action = await ctx.createUnknown();

  const clientActionID = crypto.randomUUID();
  const input = { actionID: action.action_id, choice: 'drop' as const, clientActionID };

  await ctx.client.approvals.answerUnknownOutcome(input);

  const again = await ctx.client.approvals.answerUnknownOutcome(input);

  expect(again).toStrictEqual({ actionID: action.action_id, choice: 'drop' });
});

test('#approvals.answerUnknownOutcome asks for a passkey to retry an always-ask action', async () => {
  const ctx = await setupTest();
  const action = await ctx.createUnknown();

  await ctx.markAlwaysAsk(action.action_id);

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  await ctx.client.approvals.listItems();

  const retry = ctx.client.approvals.answerUnknownOutcome({
    actionID: action.action_id,
    choice: 'retry',
    clientActionID: crypto.randomUUID(),
  });

  await expect(retry).rejects.toMatchObject({ code: 'PASSKEY_REQUIRED' });
});

test('#approvals.answerUnknownOutcome retries an always-ask action on a passkey assertion', async () => {
  const ctx = await setupTest();
  const action = await ctx.createUnknown();

  await ctx.markAlwaysAsk(action.action_id);

  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const issued = await ctx.client.passkeys.challenge({
    for: { kind: 'unknown_outcome', actionID: action.action_id, choice: 'retry' },
  });

  const passkey = await seeded.authenticator.assert(issued.options, { origin: ctx.origin });

  await ctx.client.approvals.answerUnknownOutcome({
    actionID: action.action_id,
    choice: 'retry',
    clientActionID: crypto.randomUUID(),
    passkey,
  });

  const status = await ctx.readStatus(action.action_id);

  expect(status).toBe('pending');
});

test('#approvals.answerUnknownOutcome lets it happened through without a passkey', async () => {
  const ctx = await setupTest();
  const action = await ctx.createUnknown();

  await ctx.markAlwaysAsk(action.action_id);

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  await ctx.client.approvals.answerUnknownOutcome({
    actionID: action.action_id,
    choice: 'happened',
    clientActionID: crypto.randomUUID(),
  });

  const status = await ctx.readStatus(action.action_id);

  expect(status).toBe('done');
});
