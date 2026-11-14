import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import type { LogTables } from '@heynixie/log';
import { readRecords, removeRecordKey, writeRecords } from '@heynixie/log';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import { buildMockWriteCaller } from '@heynixie/memory/test-utils';
import { buildActionProposalInput } from '@heynixie/policy';
import { readProposal, runProposalLapses, runProposalReturns } from '@heynixie/proposals';
import { createConversationTask, readInbox } from '@heynixie/tasks';
import { buildProposalCoreDeps } from './build-proposal-core-deps';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  const root = join(api.dataDir, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await runSeed({
    log: api.context.log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  // the writer stamps records with the wall clock, so the test clock starts there
  api.clock.advance(Date.now() - api.clock.now());

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: () => Promise.resolve(),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: api.clock,
      defaultZone: 'UTC',
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  const laptop = await createDeviceSession(api.context, 'laptop');

  return { api, memory, url: api.url, client: buildTestClient(api.url, laptop.token) };
}

test('#approvals.listItems lists a pending rule change with the choices it takes', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  expect(listed.items.map((item) => [item.group, item.choices])).toStrictEqual([
    ['routine', ['approve', 'defer', 'decline']],
  ]);
});

test('#approvals.answerProposal refuses a stale hash with CONFLICT and keeps the row open', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const proposalID = listed.items[0]?.proposal.proposalID ?? 'missing';

  const answer = ctx.client.approvals.answerProposal({
    proposalID,
    actionHash: 'stale',
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  expect(answer).rejects.toMatchObject({ code: 'CONFLICT' });

  const after = await ctx.client.approvals.listItems();

  expect(after.items).toHaveLength(1);
});

test('#approvals.answerProposal refuses always allow on a rule change with NOT_ALLOWED', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;

  const answer = ctx.client.approvals.answerProposal({
    proposalID: item?.proposal.proposalID ?? 'missing',
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'always_allow',
    clientActionID: crypto.randomUUID(),
  });

  expect(answer).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
});

test('#approvals.answerProposal refuses an answer to a closed proposal with CLOSED', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;
  const proposalID = item?.proposal.proposalID ?? 'missing';
  const actionHash = item?.proposal.actionHash ?? 'missing';

  await ctx.client.approvals.answerProposal({
    proposalID,
    actionHash,
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  const again = ctx.client.approvals.answerProposal({
    proposalID,
    actionHash,
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  expect(again).rejects.toMatchObject({ code: 'CLOSED' });
});

test('#approvals.answerProposal gives a retry of a refused answer the same refusal', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const clientActionID = crypto.randomUUID();
  const proposalID = listed.items[0]?.proposal.proposalID ?? 'missing';
  const answer = { proposalID, actionHash: 'stale', choice: 'approve', clientActionID } as const;
  const first = ctx.client.approvals.answerProposal(answer);

  expect(first).rejects.toMatchObject({ code: 'CONFLICT' });

  const retry = ctx.client.approvals.answerProposal(answer);

  expect(retry).rejects.toMatchObject({ code: 'CONFLICT' });
});

test('#approvals.answerProposal defers a proposal, which then lists as deferred', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;

  const answered = await ctx.client.approvals.answerProposal({
    proposalID: item?.proposal.proposalID ?? 'missing',
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'defer',
    deferUntil: new Date(ctx.api.clock.now() + 2 * 60 * 60 * 1000),
    clientActionID: crypto.randomUUID(),
  });

  const after = await ctx.client.approvals.listItems();

  expect({ state: answered.state, groups: after.items.map((entry) => entry.group) }).toStrictEqual({
    state: 'deferred',
    groups: ['deferred'],
  });
});

test('#approvals.answerProposals answers each item and refuses a stale one alone', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;
  const proposalID = item?.proposal.proposalID ?? 'missing';

  const batch = await ctx.client.approvals.answerProposals({
    answers: [
      {
        proposalID,
        actionHash: 'stale',
        choice: 'approve',
        clientActionID: crypto.randomUUID(),
      },
      {
        proposalID,
        actionHash: item?.proposal.actionHash ?? 'missing',
        choice: 'decline',
        clientActionID: crypto.randomUUID(),
      },
    ],
  });

  expect(batch.results).toStrictEqual([
    {
      proposalID,
      error: 'CONFLICT',
      current: { actionHash: item?.proposal.actionHash ?? 'missing', ruleHash: null },
    },
    { proposalID, state: 'declined' },
  ]);
});

test('#runProposalReturns brings a deferred proposal back once its return time passes', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;
  const hourMs = 60 * 60 * 1000;

  const deps = buildProposalCoreDeps(ctx.api.context, {
    readMemory: () => null,
    runInForceSeed: () => Promise.resolve(),
  });

  await ctx.client.approvals.answerProposal({
    proposalID: item?.proposal.proposalID ?? 'missing',
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'defer',
    deferUntil: new Date(ctx.api.clock.now() + 2 * hourMs),
    clientActionID: crypto.randomUUID(),
  });

  const early = await runProposalReturns(deps);

  ctx.api.clock.advance(3 * hourMs);

  const due = await runProposalReturns(deps);
  const after = await ctx.client.approvals.listItems();

  expect({ early, due, groups: after.items.map((entry) => entry.group) }).toStrictEqual({
    early: 0,
    due: 1,
    groups: ['routine'],
  });
});

test('#runProposalLapses lapses a proposal at the new time after a defer, not the old one', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;
  const dayMs = 24 * 60 * 60 * 1000;

  const deps = buildProposalCoreDeps(ctx.api.context, {
    readMemory: () => null,
    runInForceSeed: () => Promise.resolve(),
  });

  await ctx.client.approvals.answerProposal({
    proposalID: item?.proposal.proposalID ?? 'missing',
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'defer',
    deferUntil: new Date(ctx.api.clock.now() + 10 * dayMs),
    clientActionID: crypto.randomUUID(),
  });

  ctx.api.clock.advance(15 * dayMs);

  const lapsedAtOldTime = await runProposalLapses(deps);

  ctx.api.clock.advance(10 * dayMs);

  const lapsedAtNewTime = await runProposalLapses(deps);

  expect({ lapsedAtOldTime, lapsedAtNewTime }).toStrictEqual({
    lapsedAtOldTime: 0,
    lapsedAtNewTime: 1,
  });
});

test('#runSeed withdraws a rule change a defer kept open past its first lapse time when its widening goes', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;
  const dayMs = 24 * 60 * 60 * 1000;
  const proposalID = item?.proposal.proposalID ?? 'missing';

  await ctx.client.approvals.answerProposal({
    proposalID,
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'defer',
    deferUntil: new Date(ctx.api.clock.now() + 20 * dayMs),
    clientActionID: crypto.randomUUID(),
  });

  setSystemTime(new Date(Date.now() + 15 * dayMs));
  onTestFinished(() => setSystemTime());

  const root = join(ctx.api.dataDir, 'definitions');

  await rm(join(root, 'rules', 'web.yaml'));

  await runSeed({
    log: ctx.api.context.log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const row = await readProposal(ctx.api.context.log.writer.db, proposalID);

  expect(row?.state).toBe('withdrawn');
});

test('#approvals.answerProposal applies no memory write when the session is revoked between the checks and the write', async () => {
  const ctx = await setupTest();
  const phone = await createDeviceSession(ctx.api.context, 'phone');

  await ctx.memory.writes.remember({
    text: 'Keeps a rowing boat at the lake',
    caller: buildMockWriteCaller(),
  });

  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.group === 'memory');

  ctx.api.setMemory({
    ...ctx.memory,
    proposals: {
      ...ctx.memory.proposals,
      approve: async (input) => {
        await ctx.client.sessions.revoke({
          clientActionID: crypto.randomUUID(),
          sessionID: phone.sessionID,
        });

        return ctx.memory.proposals.approve(input);
      },
    },
  });

  const answer = buildTestClient(ctx.url, phone.token).approvals.answerProposal({
    proposalID: item?.proposal.proposalID ?? 'missing',
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  expect(answer).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

  const pending = await ctx.memory.proposals.listPending();

  expect(pending).toHaveLength(1);
});

test('#approvals.answerProposal puts the note of a declined memory proposal in the inbox of its task', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.api.context);

  await ctx.memory.writes.remember({
    text: 'Keeps a rowing boat at the lake',
    caller: buildMockWriteCaller({ thread: 'conversation' }),
  });

  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.group === 'memory');

  await ctx.client.approvals.answerProposal({
    proposalID: item?.proposal.proposalID ?? 'missing',
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'decline',
    note: 'Not something to remember.',
    clientActionID: crypto.randomUUID(),
  });

  const read = await readRecords(ctx.api.context.log, {
    afterSequence: 0,
    kinds: ['memory.proposal_rejected'],
    limit: 10,
  });

  expect(
    read.map((entry) => [
      entry.record.thread,
      entry.record.erasable.status === 'readable' ? entry.record.erasable.fields : null,
    ]),
  ).toStrictEqual([['conversation', { reason: 'Not something to remember.' }]]);
});

test('#approvals.listItems lists the open rows in the digest order, and leaves out closed, lapsed and erased rows', async () => {
  const ctx = await setupTest();
  const before = await ctx.client.approvals.listItems();

  const ruleChange = before.items[0]?.proposal.shortID ?? 'missing';
  const log = ctx.api.context.log;

  const ask = (thread: string, cause: 'always_ask' | 'no_rule', to: string) =>
    buildActionProposalInput({
      definitions: ctx.api.context.definitions(),
      thread,
      callSequence: 1,
      tool: cause === 'always_ask' ? 'shop.buy' : 'mail.send',
      effects: cause === 'always_ask' ? ['spend'] : ['send'],
      cause,
      input: { to },
      destinations: [{ value: to, replyTarget: false }],
    });

  const routine = ask('reports', 'no_rule', 'harbour@example.org');
  const alwaysAsk = ask('conversation', 'always_ask', 'chandlery@example.org');
  const deferred = ask('conversation', 'no_rule', 'marina@example.org');
  const declined = ask('conversation', 'no_rule', 'boatyard@example.org');
  const lapsed = ask('conversation', 'no_rule', 'ferry@example.org');
  const erased = ask('conversation', 'no_rule', 'pier@example.org');

  const written = await writeRecords(log, [
    routine.record,
    alwaysAsk.record,
    deferred.record,
    declined.record,
    { ...lapsed.record, payload: { ...lapsed.record.payload, lapsesAt: ctx.api.clock.now() - 1 } },
    erased.record,
  ]);

  const erasedKey = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', written.at(-1)?.sequence ?? 0)
    .executeTakeFirstOrThrow();

  await removeRecordKey(log, erasedKey.key_id ?? 'missing');

  await ctx.memory.writes.remember({
    text: 'Keeps a rowing boat at the lake',
    caller: buildMockWriteCaller(),
  });

  const open = await ctx.client.approvals.listItems();

  const findHash = (shortID: string) =>
    open.items.find((item) => item.proposal.shortID === shortID)?.proposal.actionHash ?? 'missing';

  await ctx.client.approvals.answerProposal({
    proposalID: deferred.shortID,
    actionHash: findHash(deferred.shortID),
    choice: 'defer',
    deferUntil: new Date(ctx.api.clock.now() + 2 * 60 * 60 * 1000),
    clientActionID: crypto.randomUUID(),
  });

  await ctx.client.approvals.answerProposal({
    proposalID: declined.shortID,
    actionHash: findHash(declined.shortID),
    choice: 'decline',
    clientActionID: crypto.randomUUID(),
  });

  const listed = await ctx.client.approvals.listItems();

  expect(listed.items.map((item) => [item.group, item.proposal.shortID])).toStrictEqual([
    ['always_ask', alwaysAsk.shortID],
    ['routine', ruleChange],
    ['routine', routine.shortID],
    ['memory', expect.any(String)],
    ['deferred', deferred.shortID],
  ]);
});

test('#approvals.answerProposal puts the note of a declined action in the inbox of the task that asked', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.api.context);

  const proposed = buildActionProposalInput({
    definitions: ctx.api.context.definitions(),
    thread: 'conversation',
    callSequence: 1,
    tool: 'mail.send',
    effects: ['send'],
    cause: 'no_rule',
    input: { to: 'harbour@example.org' },
    destinations: [{ value: 'harbour@example.org', replyTarget: false }],
  });

  await writeRecords(ctx.api.context.log, [proposed.record]);

  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.proposal.shortID === proposed.shortID);

  await ctx.client.approvals.answerProposal({
    proposalID: proposed.shortID,
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'decline',
    note: 'The harbour office is closed this week.',
    clientActionID: crypto.randomUUID(),
  });

  const inbox = await readInbox(ctx.api.context, 'conversation');

  expect(
    inbox
      .filter((record) => record.kind === 'policy.action_answered')
      .map((record) => [
        record.payload['answer'],
        record.erasable.status === 'readable' ? record.erasable.fields['reason'] : null,
      ]),
  ).toStrictEqual([['declined', 'The harbour office is closed this week.']]);
});

test('#approvals.answerProposal puts a defer and its note in the inbox of the task that asked', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.api.context);

  const proposed = buildActionProposalInput({
    definitions: ctx.api.context.definitions(),
    thread: 'conversation',
    callSequence: 1,
    tool: 'mail.send',
    effects: ['send'],
    cause: 'no_rule',
    input: { to: 'harbour@example.org' },
    destinations: [{ value: 'harbour@example.org', replyTarget: false }],
  });

  await writeRecords(ctx.api.context.log, [proposed.record]);

  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.proposal.shortID === proposed.shortID);

  await ctx.client.approvals.answerProposal({
    proposalID: proposed.shortID,
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'defer',
    deferUntil: new Date(ctx.api.clock.now() + 2 * 60 * 60 * 1000),
    note: 'After the regatta',
    clientActionID: crypto.randomUUID(),
  });

  const inbox = await readInbox(ctx.api.context, 'conversation');

  expect(
    inbox
      .filter((record) => record.kind === 'proposals.deferred')
      .map((record) => [
        record.payload['shortID'],
        record.erasable.status === 'readable' ? record.erasable.fields['note'] : null,
      ]),
  ).toStrictEqual([[proposed.shortID, 'After the regatta']]);
});

test('#runProposalReturns brings a proposal back at the time of its second defer, not its first', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;
  const hourMs = 60 * 60 * 1000;

  const deps = buildProposalCoreDeps(ctx.api.context, {
    readMemory: () => null,
    runInForceSeed: () => Promise.resolve(),
  });

  const defer = (hours: number) =>
    ctx.client.approvals.answerProposal({
      proposalID: item?.proposal.proposalID ?? 'missing',
      actionHash: item?.proposal.actionHash ?? 'missing',
      choice: 'defer',
      deferUntil: new Date(ctx.api.clock.now() + hours * hourMs),
      clientActionID: crypto.randomUUID(),
    });

  await defer(2);
  await defer(5);

  ctx.api.clock.advance(3 * hourMs);

  const atFirst = await runProposalReturns(deps);

  ctx.api.clock.advance(3 * hourMs);

  const atSecond = await runProposalReturns(deps);

  expect({ atFirst, atSecond }).toStrictEqual({ atFirst: 0, atSecond: 1 });
});

test('#runProposalReturns never brings back a deferred proposal answered before its return', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;
  const hourMs = 60 * 60 * 1000;

  const deps = buildProposalCoreDeps(ctx.api.context, {
    readMemory: () => null,
    runInForceSeed: () => Promise.resolve(),
  });

  const answer = {
    proposalID: item?.proposal.proposalID ?? 'missing',
    actionHash: item?.proposal.actionHash ?? 'missing',
  };

  await ctx.client.approvals.answerProposal({
    ...answer,
    choice: 'defer',
    deferUntil: new Date(ctx.api.clock.now() + 2 * hourMs),
    clientActionID: crypto.randomUUID(),
  });

  await ctx.client.approvals.answerProposal({
    ...answer,
    choice: 'decline',
    clientActionID: crypto.randomUUID(),
  });

  ctx.api.clock.advance(3 * hourMs);

  const returned = await runProposalReturns(deps);
  const after = await ctx.client.approvals.listItems();

  expect({ returned, items: after.items }).toStrictEqual({ returned: 0, items: [] });
});

test('#runProposalLapses lapses a proposal deferred past its deadline at the deadline', async () => {
  const ctx = await setupTest();

  const hourMs = 60 * 60 * 1000;
  const deadlineAt = ctx.api.clock.now() + 4 * hourMs;

  const proposed = buildActionProposalInput({
    definitions: ctx.api.context.definitions(),
    thread: 'conversation',
    callSequence: 1,
    tool: 'mail.send',
    effects: ['send'],
    cause: 'no_rule',
    input: { to: 'harbour@example.org' },
    destinations: [{ value: 'harbour@example.org', replyTarget: false }],
  });

  await writeRecords(ctx.api.context.log, [
    { ...proposed.record, payload: { ...proposed.record.payload, deadlineAt } },
  ]);

  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.proposal.shortID === proposed.shortID);

  const deps = buildProposalCoreDeps(ctx.api.context, {
    readMemory: () => null,
    runInForceSeed: () => Promise.resolve(),
  });

  await ctx.client.approvals.answerProposal({
    proposalID: proposed.shortID,
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'defer',
    deferUntil: new Date(ctx.api.clock.now() + 24 * hourMs),
    clientActionID: crypto.randomUUID(),
  });

  ctx.api.clock.advance(3 * hourMs);

  const beforeDeadline = await runProposalLapses(deps);

  ctx.api.clock.advance(2 * hourMs);

  const afterDeadline = await runProposalLapses(deps);

  expect({ beforeDeadline, afterDeadline }).toStrictEqual({ beforeDeadline: 0, afterDeadline: 1 });
});
