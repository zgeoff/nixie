import { expect, test } from 'bun:test';
import { runActionAttempt } from '@heynixie/actions';
import {
  claimTestAction,
  createTestStep,
  queueTestAction,
  startTestActions,
} from '@heynixie/actions/test-utils';
import type { ActionConnector } from '@heynixie/connections';
import { startGmailTools } from '@heynixie/google/test-utils';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';

async function setupTest() {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  return {
    ...actions,
    step,
    readOutcomes: async () => {
      const entries = await readRecords(actions.context.log, { afterSequence: 0, limit: 200 });

      return entries
        .map((entry) => entry.record)
        .filter((record) => record.kind === 'action.outcome')
        .map((record) => record.payload);
    },
    queueGmailSend: () =>
      queueTestAction(actions.context, {
        step,
        tool: 'gmail.send',
        actionHash: 'sha256:gmail-send-1',
        arguments: {
          connection: 'k3x9m2p7qa',
          to: ['sam@example.org'],
          cc: [],
          bcc: [],
          subject: 'Q3 numbers',
          text: 'Hi Sam.',
        },
        decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
      }),
    runGmailNext: async (connector: ActionConnector) => {
      const lease = await claimTestAction(actions.context, { holder: 'runner-a', leaseMs: 60_000 });

      await runActionAttempt(actions.context, lease, {
        connectors: new Map([['gmail.send', connector]]),
        leaseMs: 60_000,
      });
    },
  };
}

test('it settles an unknown Gmail send as done once the Sent folder holds it, with one mail sent', async () => {
  const ctx = await setupTest();
  const gmail = await startGmailTools();

  const connector = gmail.findAction('gmail.send').queued;

  invariant(connector, 'gmail.send runs queued');

  await ctx.queueGmailSend();

  gmail.site.gmail.sendOutcomes.push('error_after_send');

  await ctx.runGmailNext(connector);

  ctx.clock.advance(300_000);

  await ctx.runGmailNext(connector);

  const outcomes = await ctx.readOutcomes();

  expect([
    outcomes.map((outcome) => outcome['status']),
    gmail.site.gmail.sent.length,
  ]).toStrictEqual([['done'], 1]);
});

test('it brings an unknown Gmail send to the owner when the Sent folder lacks it, and sends nothing again', async () => {
  const ctx = await setupTest();
  const gmail = await startGmailTools();

  const connector = gmail.findAction('gmail.send').queued;

  invariant(connector, 'gmail.send runs queued');

  await ctx.queueGmailSend();

  gmail.site.gmail.sendOutcomes.push('error_after_send');

  await ctx.runGmailNext(connector);

  gmail.site.gmail.messages.clear();
  gmail.site.gmail.sent.splice(0);
  ctx.clock.advance(300_000);

  await ctx.runGmailNext(connector);

  const outcomes = await ctx.readOutcomes();

  expect([
    outcomes.map((outcome) => outcome['status']),
    gmail.site.gmail.sent.length,
  ]).toStrictEqual([['unknown'], 0]);
});
