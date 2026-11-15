import { expect, test } from 'bun:test';
import { writeProposedRule } from '@heynixie/definitions';
import { withWriteTransaction } from '@heynixie/log';
import { readProposal } from '@heynixie/proposals';
import { ORPCError } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import invariant from 'tiny-invariant';
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
    proposeRule: () =>
      withWriteTransaction(api.context.log.writer, (tx) =>
        writeProposedRule(tx, api.context, {
          groupHash: 'group-1',
          rule: { outcome: 'allow', tools: ['test.send'], destinations: ['sam@example.org'] },
          approvals: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
          editOf: null,
        }),
      ),
    readRow: (proposalID: string) => readProposal(api.context.log.writer.db, proposalID),
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

test('#editProposedRule refuses a client action ID reused with another rule', async () => {
  const ctx = await setupTest();
  const seeded = await ctx.proposeRule();
  const row = await ctx.readRow(seeded.proposalID);

  invariant(row, 'the proposed rule opened a row');

  const clientActionID = crypto.randomUUID();

  await ctx.client.editProposedRule({
    proposalID: seeded.proposalID,
    actionHash: row.actionHash,
    rule: { outcome: 'allow', tools: ['test.send'], destinations: ['*@example.org'] },
    clientActionID,
  });

  const code = await ctx.readCode(
    ctx.client.editProposedRule({
      proposalID: seeded.proposalID,
      actionHash: row.actionHash,
      rule: { outcome: 'allow', tools: ['test.send'], destinations: ['kim@example.org'] },
      clientActionID,
    }),
  );

  expect(code).toBe('CLIENT_ACTION_ID_REUSED');
});

test('#editProposedRule replays the same edit under the same client action ID', async () => {
  const ctx = await setupTest();
  const seeded = await ctx.proposeRule();
  const row = await ctx.readRow(seeded.proposalID);

  invariant(row, 'the proposed rule opened a row');

  const input = {
    proposalID: seeded.proposalID,
    actionHash: row.actionHash,
    rule: { outcome: 'allow', tools: ['test.send'], destinations: ['*@example.org'] },
    clientActionID: crypto.randomUUID(),
  };

  const first = await ctx.client.editProposedRule(input);
  const second = await ctx.client.editProposedRule(input);

  expect(second).toStrictEqual(first);
});
