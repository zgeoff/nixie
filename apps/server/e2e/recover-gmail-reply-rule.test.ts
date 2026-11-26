import { expect, onTestFinished, test } from 'bun:test';
import {
  connectTestGoogle,
  createTestClient,
  makeHasTool,
  runOracle,
  startE2ENixie,
  startFakeGoogleSite,
} from '@heynixie/server/test-utils';
import { waitFor } from '@zgeoff/testing';

async function setupTest() {
  const google = await startFakeGoogleSite();

  onTestFinished(() => google.stop());

  const nixie = await startE2ENixie({
    googleURL: google.url,
    googleAPI: google.api,
    isCheckerScripted: true,
  });

  const readRuleSets = async () => {
    const records = await nixie.readRecords();

    return records.filter((record) => record.kind === 'trigger.wake_rule_set');
  };

  return { google, nixie, readRuleSets, isConversationTurn: makeHasTool('mcp__nixie__gmail_send') };
}

test('it keeps one reply rule and settles the send as done when nixie dies after Gmail took the mail and before the outcome commits', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  const api = await createTestClient(first);

  await ctx.nixie.waitForQueueCheck();

  await connectTestGoogle(api);

  await first.request('arm', { point: 'attempt.result.before' });
  await ctx.nixie.markKnownContact('sam@example.org');

  // the consent checker finds the send in the user's own words, so it needs no approval
  ctx.nixie.checkerModel.addReplies({
    toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
  });

  ctx.nixie.model.addReplies({
    when: ctx.isConversationTurn,
    toolUse: {
      name: 'mcp__nixie__gmail_send',
      input: { to: ['sam@example.org'], subject: 'Plum notes', text: 'The notes are attached.' },
    },
  });

  void first.request('sendMessage', {
    thread: 'conversation',
    text: 'Email sam@example.org the plum notes, subject Plum notes.',
  });

  await first.waitForArrival('attempt.result.before');

  const ruleBeforeKill = await ctx.readRuleSets();

  await first.kill();

  ctx.nixie.model.addReplies({ when: ctx.isConversationTurn, text: 'It was sent.' });

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForQueueCheck();

  // the check of an unknown send runs once the connector's trust time of 5 minutes has passed
  const outcome = await ctx.nixie.advanceUntilRecord(
    60_000,
    8,
    (record) =>
      record.kind === 'action.outcome' &&
      record.thread === 'conversation' &&
      record.payload['tool'] === 'gmail.send',
  );

  const rules = await ctx.readRuleSets();
  const records = await ctx.nixie.readRecords();

  const shortID = String(rules.at(-1)?.payload['shortID']);

  // the outcome wakes the conversation, whose turn reads the send's result with its rule's short ID
  const resultSeen = await waitFor(() => {
    const bodies = ctx.nixie.model.requests.map((request) => JSON.stringify(request.body));

    expect(bodies).toSatisfyAny((body: string) => body.includes(shortID));

    return true;
  });

  await second.kill();

  const oracle = await runOracle(ctx.nixie);

  expect(ruleBeforeKill).toHaveLength(1);
  expect(ctx.google.gmail.sent).toHaveLength(1);
  expect(outcome.payload).toMatchObject({ tool: 'gmail.send', status: 'done' });
  expect(new Set(rules.map((rule) => rule.payload['ruleID'])).size).toBe(1);

  expect(rules.at(-1)?.payload).toMatchObject({
    match: { thread: ctx.google.gmail.sent[0]?.threadID },
    target: { kind: 'conversation' },
    origin: 'reply',
  });

  expect(records.filter((record) => record.kind === 'trigger.wake_rule_ended')).toStrictEqual([]);
  expect(resultSeen).toBeTrue();

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    strayReplies: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});
