import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ApprovedCall } from '@heynixie/actions';
import { claimAction, runActionAttempt } from '@heynixie/actions';
import { seedJoinedSession } from '@heynixie/coding/test-utils';
import type { ProviderResponse } from '@heynixie/connectors';
import { encodeTestImage, seedImage } from '@heynixie/connectors/test-utils';
import { checkPromptProposal, createPathSource, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed, seedLegacyRuleProposal } from '@heynixie/definitions/test-utils';
import type { LogTables } from '@heynixie/log';
import {
  readRecords,
  removeRecordKey,
  withWriteTransaction,
  writeRecords,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import { buildMockWriteCaller } from '@heynixie/memory/test-utils';
import type { Effect } from '@heynixie/policy';
import { buildActionProposalInput, writeActionProposal } from '@heynixie/policy';
import { promptsOverrideProposedCodec } from '@heynixie/prompts';
import {
  buildProposeDeps,
  proposeInTransaction,
  readProposal,
  runProposalLapses,
  runProposalReturns,
} from '@heynixie/proposals';
import { createConversationTask, readInbox, writeTaskControl } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { toolCalledCodec } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildProposalCoreDeps } from '../proposal/build-proposal-core-deps';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { seedPasskey } from '../test-utils/seed-passkey';
import { seedScreenClickCard } from '../test-utils/seed-screen-click-card';
import { startTestAPI } from '../test-utils/start-test-api';

interface PasskeyTarget {
  readonly proposalID: string;
  readonly actionHash: string;
}

async function setupTest() {
  const api = await startTestAPI(undefined, { isCodingOn: true });

  const root = join(api.dataDir, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: api.context.log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  // the writer stamps records with the wall clock, so the test clock starts there
  api.clock.advance(Date.now() - api.clock.now());

  // a rule change proposal that a seed of an earlier release left pending
  await seedLegacyRuleProposal(api.context.log);

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
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
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);
  const origin = 'https://nixie.example.org';
  const passkeyClient = buildTestClient(api.url, laptop.token, origin);

  // the prompts in force, with a counter for the exports they wake
  const exports = { woken: 0 };

  const proposePrompt = (proposalHash: string) =>
    withWriteTransaction(api.context.log.writer, async (tx) => {
      const created = await proposeInTransaction(buildProposeDeps(api.context), tx, {
        family: 'prompt',
        kind: 'internal_change',
        cause: 'prompt_override',
        riskClass: 'always_ask',
        actionHash: proposalHash,
        ruleHash: null,
        thread: 'conversation',
        taskID: null,
        deadlineAt: null,
        sameThing: 'compaction',
      });

      await writeRecordsInTransaction(tx, api.context.log, [
        {
          kind: 'prompts.override_proposed',
          thread: 'conversation',
          definitions: api.context.definitions(),
          payload: promptsOverrideProposedCodec.encode({
            proposalID: created.proposalID,
            promptID: 'compaction',
            proposalHash,
            baseHash: null,
            entry: { _template: '{{ parts.safety }}' },
            files: [],
            reason: 'Keep the safety part.',
            provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
          }),
        },
      ]);

      return created;
    });

  // answers an always-ask row with an assertion of a passkey that the laptop registered
  const answerWithPasskey = async (target: PasskeyTarget) => {
    const seeded = await seedPasskey(api.context, { caller: laptop.caller });

    const answer = { ...target, choice: 'approve' as const };

    const issued = await passkeyClient.passkeys.challenge({ for: { kind: 'answer', ...answer } });
    const passkey = await seeded.authenticator.assert(issued.options, { origin });

    return passkeyClient.approvals.answerProposal({
      ...answer,
      clientActionID: crypto.randomUUID(),
      passkey,
    });
  };

  const proposeMailSend = (thread: string) =>
    withWriteTransaction(api.context.log.writer, (tx) =>
      writeActionProposal(
        tx,
        {
          log: api.context.log,
          clock: api.context.clock,
          definitions: api.context.definitions,
        },
        {
          definitions: api.context.definitions(),
          thread,
          callSequence: 1,
          tool: 'mail.send',
          effects: ['send'],
          cause: 'no_rule',
          input: { to: 'harbour@example.org' },
          destinations: [{ value: 'harbour@example.org', replyTarget: false }],
        },
      ),
    );

  return {
    laptop,
    exports,
    proposeMailSend,
    proposePrompt,
    answerWithPasskey,
    api,
    memory,
    url: api.url,
    client,
    seed: {
      // an ask for a mail.send that the owner approved, so its action is queued
      approvedMailSend: async () => {
        await createConversationTask(api.context);

        const proposed = buildActionProposalInput({
          definitions: api.context.definitions(),
          thread: 'conversation',
          callSequence: 1,
          tool: 'mail.send',
          effects: ['send'],
          cause: 'ask_rule',
          input: {},
          destinations: [],
        });

        await writeRecords(api.context.log, [proposed.record]);

        const listed = await client.approvals.listItems();

        const item = listed.items.find((entry) => entry.proposal.shortID === proposed.shortID);

        invariant(item);

        await client.approvals.answerProposal({
          proposalID: item.proposal.proposalID,
          actionHash: item.proposal.actionHash,
          choice: 'approve',
          clientActionID: crypto.randomUUID(),
        });

        return item.proposal.proposalID;
      },
    },
  };
}

test('#approvals.listItems lists a pending rule change with the choices it takes', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  expect(listed.items.map((item) => [item.group, item.choices])).toStrictEqual([
    ['routine', ['approve', 'defer', 'decline']],
  ]);
});

test('#approvals.listItems shows the labels and the labels reason of a label-only memory proposal', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.remember({
    text: 'The piano is tuned each March',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.writes.editLabels({
    target: item,
    labels: { gist: 'piano tuning', topic: 'home/music', triggers: ['tuner'] },
    caller: buildMockWriteCaller(),
  });

  const listed = await ctx.client.approvals.listItems();

  const memory = listed.items.flatMap((entry) =>
    'memory' in entry.body && entry.body.memory !== null ? [entry.body.memory] : [],
  );

  expect(memory).toMatchObject([
    {
      itemID: item.itemID,
      reason: 'labels',
      labels: {
        gist: 'piano tuning',
        topic: 'home/music',
        triggers: ['tuner'],
        isLabelOnly: true,
      },
    },
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

test('#approvals.answerProposal approves a prompt override with the browser channel and the device identity, and wakes the export at once', async () => {
  const ctx = await setupTest();

  ctx.api.setPrompts({
    readInForce: () => null,
    checkProposal: checkPromptProposal,
    wakeExports: () => {
      ctx.exports.woken += 1;
    },
  });

  const proposed = await ctx.proposePrompt('hash-c');

  await ctx.answerWithPasskey({ proposalID: proposed.shortID, actionHash: 'hash-c' });

  const approved = await readRecords(ctx.api.context.log, {
    afterSequence: 0,
    kinds: ['prompts.override_approved'],
  });

  const row = await readProposal(ctx.api.context.log.writer.db, proposed.proposalID);

  expect(approved.map((entry) => entry.record.payload)).toMatchObject([
    { proposalID: proposed.proposalID, channel: 'browser', approver: 'owner' },
  ]);

  expect([ctx.exports.woken, row?.state]).toStrictEqual([1, 'approved']);
  expect(row?.answeredBy).toBe(ctx.laptop.caller.identityID);
});

test('#approvals.answerProposal refuses a prompt override approval once the override in force moved past its base with CONFLICT', async () => {
  const ctx = await setupTest();

  ctx.api.setPrompts({
    readInForce: () => ({
      snapshotHash: 'snapshot-b',
      personaVersion: 'persona-a',
      prompts: { compaction: { parts: { safety: 'Answer in one line.' }, template: null } },
    }),
    checkProposal: checkPromptProposal,
    wakeExports: () => {},
  });

  const proposed = await ctx.proposePrompt('hash-c');

  const answer = ctx.answerWithPasskey({ proposalID: proposed.shortID, actionHash: 'hash-c' });

  await Promise.allSettled([answer]);

  const row = await readProposal(ctx.api.context.log.writer.db, proposed.proposalID);

  expect(answer).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(row?.state).toBe('pending');
});

test('#approvals.answerProposal declines a prompt override whose base the override in force moved past', async () => {
  const ctx = await setupTest();

  ctx.api.setPrompts({
    readInForce: () => ({
      snapshotHash: 'snapshot-b',
      personaVersion: 'persona-a',
      prompts: { compaction: { parts: { safety: 'Answer in one line.' }, template: null } },
    }),
    checkProposal: checkPromptProposal,
    wakeExports: () => {},
  });

  const proposed = await ctx.proposePrompt('hash-c');

  await ctx.client.approvals.answerProposal({
    proposalID: proposed.shortID,
    actionHash: 'hash-c',
    choice: 'decline',
    clientActionID: crypto.randomUUID(),
  });

  const row = await readProposal(ctx.api.context.log.writer.db, proposed.proposalID);

  expect(row?.state).toBe('declined');
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

test('#runSeed withdraws a rule change a defer kept open past its first lapse time', async () => {
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

  await runSeed({
    tasks: buildTestTaskSeed(),
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
    kinds: ['proposals.settled'],
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

test.each<{ tool: string; effects: Effect[]; runsInStep: boolean }>([
  { tool: 'memory.export', effects: ['export'], runsInStep: true },
  { tool: 'mail.send', effects: ['send'], runsInStep: false },
])(
  '#approvals.answerProposal queues an approved $tool, for the step to run when it runs inside the turn',
  async (row) => {
    const ctx = await setupTest();

    await createConversationTask(ctx.api.context);

    const proposed = buildActionProposalInput({
      definitions: ctx.api.context.definitions(),
      thread: 'conversation',
      callSequence: 1,
      tool: row.tool,
      effects: row.effects,
      cause: 'ask_rule',
      input: {},
      destinations: [],
    });

    await writeRecords(ctx.api.context.log, [proposed.record]);

    const listed = await ctx.client.approvals.listItems();

    const item = listed.items.find((entry) => entry.proposal.shortID === proposed.shortID);

    await ctx.client.approvals.answerProposal({
      proposalID: proposed.shortID,
      actionHash: item?.proposal.actionHash ?? 'missing',
      choice: 'approve',
      clientActionID: crypto.randomUUID(),
    });

    const read = await readRecords(ctx.api.context.log, {
      afterSequence: 0,
      kinds: ['action.queued'],
    });

    expect(
      read.map((entry) => [entry.record.payload['tool'], entry.record.payload['runsInStep']]),
    ).toStrictEqual([[row.tool, row.runsInStep ? true : undefined]]);
  },
);

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

test('#approvals.readProposals reads an open row with its choices, its approve label and no answering device', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;

  invariant(item);

  const read = await ctx.client.approvals.readProposals({
    proposalIDs: [item.proposal.proposalID],
  });

  expect(read).toStrictEqual({
    proposals: [
      {
        proposal: item.proposal,
        body: item.body,
        task: item.task,
        chain: item.chain,
        choices: ['approve', 'defer', 'decline'],
        passkeyChoices: [],
        answeredOn: null,
        isAnsweredHere: false,
        call: null,
      },
    ],
  });
});

test('#approvals.readProposals reads a closed row with no choices and the device that answered it', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;
  const proposalID = item?.proposal.proposalID ?? 'missing';

  await ctx.client.approvals.answerProposal({
    proposalID,
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  const phone = await createDeviceSession(ctx.api.context, 'phone');

  const fromPhone = buildTestClient(ctx.url, phone.token);

  const here = await ctx.client.approvals.readProposals({ proposalIDs: [proposalID] });
  const elsewhere = await fromPhone.approvals.readProposals({ proposalIDs: [proposalID] });

  expect({
    here: here.proposals.map((read) => [
      read.proposal.state,
      read.choices,
      read.answeredOn,
      read.isAnsweredHere,
    ]),
    elsewhere: elsewhere.proposals.map((read) => [
      read.choices,
      read.answeredOn,
      read.isAnsweredHere,
    ]),
  }).toStrictEqual({
    here: [['approved', [], 'laptop', true]],
    elsewhere: [[[], 'laptop', false]],
  });
});

test('#approvals.readProposals shows a call that has not run as waiting', async () => {
  const ctx = await setupTest();
  const proposalID = await ctx.seed.approvedMailSend();
  const read = await ctx.client.approvals.readProposals({ proposalIDs: [proposalID] });

  expect(read.proposals.map((entry) => entry.call)).toStrictEqual([
    { state: 'waiting', reason: null },
  ]);
});

test.each<{ result: ProviderResponse; call: ApprovedCall }>([
  { result: { kind: 'success', result: {} }, call: { state: 'applied', reason: null } },
  {
    result: { kind: 'refused', reason: 'the harbour office is closed' },
    call: { state: 'failed', reason: 'the harbour office is closed' },
  },
  { result: { kind: 'ambiguous', reason: 'timed out' }, call: { state: 'unknown', reason: null } },
])('#approvals.readProposals shows a call that ran as $call.state', async (row) => {
  const ctx = await setupTest();
  const proposalID = await ctx.seed.approvedMailSend();
  const lease = await claimAction(ctx.api.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(lease);

  await runActionAttempt(ctx.api.context, lease, {
    connectors: new Map([['mail.send', { run: () => Promise.resolve(row.result) }]]),
    leaseMs: 60_000,
  });

  const read = await ctx.client.approvals.readProposals({ proposalIDs: [proposalID] });

  expect(read.proposals.map((entry) => entry.call)).toStrictEqual([row.call]);
});

test('#approvals.readProposals shows a call that a stop cancelled as failed', async () => {
  const ctx = await setupTest();
  const proposalID = await ctx.seed.approvedMailSend();

  await writeTaskControl(ctx.api.context, { taskID: 'conversation', control: 'stop' });

  const read = await ctx.client.approvals.readProposals({ proposalIDs: [proposalID] });

  expect(read.proposals.map((entry) => entry.call)).toStrictEqual([
    { state: 'failed', reason: 'the task was stopped before it ran' },
  ]);
});

test('#approvals.readProposals shows no call for a row that is not an approved action', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;

  invariant(item);

  await ctx.client.approvals.answerProposal({
    proposalID: item.proposal.proposalID,
    actionHash: item.proposal.actionHash,
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  const read = await ctx.client.approvals.readProposals({
    proposalIDs: [item.proposal.proposalID],
  });

  expect(read.proposals.map((entry) => [entry.proposal.state, entry.call])).toStrictEqual([
    ['approved', null],
  ]);
});

test('#approvals.readProposals reads a row by its short ID and leaves out an ID that names no row', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.approvals.listItems();

  const [item] = listed.items;

  invariant(item);

  const read = await ctx.client.approvals.readProposals({
    proposalIDs: [item.proposal.shortID, 'no-such-proposal'],
  });

  expect(read.proposals.map((entry) => entry.proposal.proposalID)).toStrictEqual([
    item.proposal.proposalID,
  ]);
});

test('#approvals.listItems shows the kind and the text of the record that a log.forget ask removes, with the counts', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.api.context);

  const [message] = await writeRecords(ctx.api.context.log, [
    {
      kind: 'owner_message',
      definitions: ctx.api.context.definitions(),
      thread: 'conversation',
      erasable: { text: 'The shed key sits under the blue pot.', spans: [] },
    },
  ]);

  invariant(message);

  const proposed = buildActionProposalInput({
    definitions: ctx.api.context.definitions(),
    thread: 'conversation',
    callSequence: 1,
    tool: 'log.forget',
    effects: ['delete'],
    cause: 'ask_rule',
    input: { record: String(message.sequence) },
    destinations: [],
  });

  await writeRecords(ctx.api.context.log, [proposed.record]);

  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.proposal.shortID === proposed.shortID);

  expect(item?.body?.fields).toStrictEqual({
    record: String(message.sequence),
    kind: 'owner_message',
    text: 'The shed key sits under the blue pot.',
    moments: '0',
    'memory items': '0',
  });
});

test('#approvals.listItems shows a log.forget ask with no body when its record is not on the thread', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.api.context);

  const proposed = buildActionProposalInput({
    definitions: ctx.api.context.definitions(),
    thread: 'conversation',
    callSequence: 1,
    tool: 'log.forget',
    effects: ['delete'],
    cause: 'ask_rule',
    input: { record: '99999' },
    destinations: [],
  });

  await writeRecords(ctx.api.context.log, [proposed.record]);

  const read = await ctx.client.approvals.readProposals({ proposalIDs: [proposed.shortID] });

  expect(read.proposals.map((entry) => entry.body)).toStrictEqual([null]);
});

test('#approvals.listItems shows each photo that an image.draw ask names, and not a drawn image', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.api.context);

  const encoded = await encodeTestImage({ width: 8, height: 6 }, 'png');

  const bytes = new Uint8Array(encoded);

  await seedImage(ctx.api.context.log, { image: 'photoaaaaa', source: 'photo', bytes });
  await seedImage(ctx.api.context.log, { image: 'drawnbbbbb', source: 'draw', bytes });

  const proposed = buildActionProposalInput({
    definitions: ctx.api.context.definitions(),
    thread: 'conversation',
    callSequence: 1,
    tool: 'image.draw',
    effects: ['fetch', 'send'],
    cause: 'ask_rule',
    input: { prompt: 'a cartoon of this', from: 'photoaaaaa', references: ['drawnbbbbb'] },
    destinations: [{ value: 'openai', replyTarget: false }],
  });

  await writeRecords(ctx.api.context.log, [proposed.record]);

  const read = await ctx.client.approvals.readProposals({ proposalIDs: [proposed.shortID] });

  expect(read.proposals.map((entry) => entry.body?.images)).toStrictEqual([['photoaaaaa']]);
});

test('#approvals.readImage returns the stored picture of an image, and refuses an unknown one', async () => {
  const ctx = await setupTest();
  const encoded = await encodeTestImage({ width: 8, height: 6 }, 'png');

  const bytes = new Uint8Array(encoded);

  await seedImage(ctx.api.context.log, { image: 'photoaaaaa', source: 'photo', bytes });

  const file = await ctx.client.approvals.readImage({ imageID: 'photoaaaaa' });

  const missing = ctx.client.approvals.readImage({ imageID: 'nothing000' });

  const received = await file.arrayBuffer();

  expect(new Uint8Array(received)).toStrictEqual(bytes);
  expect(file.type).toBe('image/png');
  expect(missing).rejects.toMatchObject({ code: 'IMAGE_NOT_FOUND' });
});

test('#approvals.readProposals gives the card of a screen click its picture and the point', async () => {
  const ctx = await setupTest();
  const encoded = await encodeTestImage({ width: 8, height: 6 }, 'png');

  const bytes = new Uint8Array(encoded);

  const card = await seedScreenClickCard(ctx.api.context, bytes);
  const read = await ctx.client.approvals.readProposals({ proposalIDs: [card.shortID] });

  const file = await ctx.client.approvals.readImage({
    imageID: `screen-${String(card.callSequence)}`,
  });

  expect(read.proposals.map((entry) => entry.body?.screen)).toStrictEqual([
    { x: 412, y: 233, picture: `screen-${String(card.callSequence)}` },
  ]);

  const received = await file.arrayBuffer();

  expect(new Uint8Array(received)).toStrictEqual(bytes);
  expect(file.type).toBe('image/png');
});

test('#approvals.readProposals gives the card of a screen click with no stored picture none', async () => {
  const ctx = await setupTest();
  const card = await seedScreenClickCard(ctx.api.context, null);
  const read = await ctx.client.approvals.readProposals({ proposalIDs: [card.shortID] });

  expect(read.proposals.map((entry) => entry.body?.screen)).toStrictEqual([undefined]);
});

test('#approvals.readImage refuses a screen picture ID that names no screen click call', async () => {
  const ctx = await setupTest();
  const encoded = await encodeTestImage({ width: 8, height: 6 }, 'png');

  const bytes = new Uint8Array(encoded);

  const [other] = await writeRecords(ctx.api.context.log, [
    {
      kind: 'tool_called',
      definitions: ctx.api.context.definitions(),
      thread: 'conversation',
      payload: toolCalledCodec.encode({
        callID: 'call-2',
        runID: 'run-1',
        toolUseID: null,
        tool: 'computer.run',
      }),
      erasable: { input: {} },
      attachments: [bytes],
    },
  ]);

  invariant(other, 'the call was written');

  const refused = ctx.client.approvals.readImage({ imageID: `screen-${String(other.sequence)}` });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'IMAGE_NOT_FOUND' });
});

test('#approvals.readProposals and #approvals.listItems give the chain from the conversation through each task to the asking task, by short ID and name', async () => {
  const ctx = await setupTest();

  const seeder = buildTaskSeeder({ context: ctx.api.context });

  const step = await seeder.conversationStep();

  const parentID = await seeder.task({
    starter: step.claim,
    name: 'Read the inbox',
    brief: 'Read the new mail.',
  });

  const askingID = await seeder.childTask({
    parentID,
    name: 'Check the sender',
    brief: 'Check who sent it.',
  });

  const shortID = await ctx.proposeMailSend(askingID);
  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.proposal.shortID === shortID);

  invariant(item);

  const read = await ctx.client.approvals.readProposals({
    proposalIDs: [item.proposal.proposalID],
  });

  const expected = [
    {
      kind: 'message' as const,
      id: 'conversation',
      name: 'Your message: Please look into this for me.',
    },
    { kind: 'task' as const, id: parentID, name: 'Read the inbox' },
    { kind: 'task' as const, id: askingID, name: 'Check the sender' },
  ];

  expect({ listed: item.chain, read: read.proposals[0]?.chain }).toStrictEqual({
    listed: expected,
    read: expected,
  });
});

test('#approvals.listItems gives the starting message alone for a call that the conversation made itself', async () => {
  const ctx = await setupTest();

  const seeder = buildTaskSeeder({ context: ctx.api.context });

  await seeder.conversationStep();

  const shortID = await ctx.proposeMailSend('conversation');
  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.proposal.shortID === shortID);

  invariant(item);

  expect(item.chain).toStrictEqual([
    { kind: 'message', id: 'conversation', name: 'Your message: Please look into this for me.' },
  ]);
});

test('#approvals.listItems names the coding session that a task in the chain binds by its short ID', async () => {
  const ctx = await setupTest();

  invariant(ctx.api.coding, 'the test turns coding on');

  const codingTaskID = await seedJoinedSession(ctx.api.coding, ctx.api.context, {
    id: 'cloud.3f9a1c2e.00000001',
    name: 'login fix',
    state: 'idle',
  });

  const shortID = await ctx.proposeMailSend(codingTaskID);
  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.proposal.shortID === shortID);

  invariant(item);

  expect(item.chain.map((step) => step.kind)).toStrictEqual(['message', 'coding']);
});
