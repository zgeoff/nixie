import { expect, test } from 'bun:test';
import { buildSeeder, startTestAPI } from '@heynixie/api/test-utils';
import { readRecords, writeRecords } from '@heynixie/log';
import type { RuleEntry } from '@heynixie/policy';
import { makeDecisionPoint } from '@heynixie/policy';
import {
  buildPolicyCall,
  readStarterDecisionPoint,
  readStarterRules,
} from '@heynixie/policy/test-utils';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildLogForgetTool } from './build-log-forget-tool';

async function setupTest() {
  const api = await startTestAPI();

  const forget = buildLogForgetTool({
    ...api.context,
    readSessionCleanup: () => () => Promise.resolve(),
  });

  const registry = buildToolRegistry([forget.tool]);
  const definitions = { snapshotHash: 'sha256:test' };

  const writeRecord = async (kind: 'owner_message' | 'memory.image_offered') => {
    const [record] = await writeRecords(api.context.log, [
      kind === 'owner_message'
        ? {
            kind,
            definitions,
            thread: 'conversation',
            erasable: { text: 'The shed key sits under the blue pot.', spans: [] },
          }
        : {
            kind,
            definitions,
            thread: 'conversation',
            payload: { messageSequence: 1, image: 1, runID: 'run-offer' },
            erasable: { text: 'A photo of the spare key.' },
          },
    ]);

    invariant(record);

    return record.sequence;
  };

  const decideWith = (rules: readonly RuleEntry[]) =>
    makeDecisionPoint({
      findDeclaration: () => forget.tool.declaration,
      readInputs: () =>
        Promise.resolve({ rules, contacts: [], tools: new Map(), ownerDestinations: [] }),
      findTaskDestinations: () => [],
      readConsent: () => Promise.resolve(null),
    });

  const callTool = (record: string) =>
    runToolCall(
      { tool: 'log.forget', input: { record }, toolUseID: null },
      {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: ['log.forget'],
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
      {
        registry,
        decide: readStarterDecisionPoint(() => forget.tool.declaration),
        log: api.context.log,
        definitions: api.context.definitions,
        queue: {
          enqueue: () => Promise.reject(new Error('a refused call queues nothing')),
          readOpenRepeat: () => Promise.resolve(null),
          readOpenAsk: () => Promise.resolve(null),
          waitForOutcome: () => Promise.resolve(null),
        },
        queuedWaitMs: 1000,
      },
    );

  const allowEntry: RuleEntry = {
    id: 'allow-log-forget',
    revision: 2,
    rule: { id: 'allow-log-forget', outcome: 'allow', tools: ['log.forget'] },
  };

  const call = buildPolicyCall({
    tool: 'log.forget',
    toolList: ['log.forget'],
    args: { record: '4' },
  });

  return {
    ...api,
    allowEntry,
    call,
    forget,
    seed: buildSeeder(api),
    writeRecord,
    callTool,
    decideWith,
    readKinds: async () => {
      const entries = await readRecords(api.context.log, { afterSequence: 0 });

      return entries.map((entry) => entry.record.kind);
    },
  };
}

test('it asks under the starter rules, by the rule that asks before a permanent delete', async () => {
  const ctx = await setupTest();
  const verdict = await readStarterDecisionPoint(() => ctx.forget.tool.declaration)(ctx.call);

  expect(verdict.decision).toMatchObject({
    outcome: 'ask',
    rule: { id: 'ask-permanent-deletes' },
  });
});

test('it still asks when an allow rule for the tool stands beside the starter rule that asks', async () => {
  const ctx = await setupTest();
  const verdict = await ctx.decideWith([...readStarterRules(), ctx.allowEntry])(ctx.call);

  expect(verdict.decision).toMatchObject({
    outcome: 'ask',
    rule: { id: 'ask-permanent-deletes' },
  });
});

test('it allows when an allow rule for the tool stands and the starter rule that asks is gone', async () => {
  const ctx = await setupTest();

  const verdict = await ctx.decideWith([
    ...readStarterRules().filter((entry) => entry.id !== 'ask-permanent-deletes'),
    ctx.allowEntry,
  ])(ctx.call);

  expect(verdict.decision).toMatchObject({ outcome: 'allow' });
});

test('it refuses a record of a kind it cannot remove, and writes no proposal', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeRecord('memory.image_offered');
  const result = await ctx.callTool(String(sequence));

  expect(result).toStrictEqual({
    content: [
      {
        type: 'text',
        text: expect.stringContaining('nixie cannot remove a memory.image_offered record'),
      },
    ],
    isError: true,
  });

  const kinds = await ctx.readKinds();

  expect(kinds).not.toContain('policy.action_proposed');
});

test('it refuses an event ID that names no record of the thread, and writes no proposal', async () => {
  const ctx = await setupTest();
  const result = await ctx.callTool('#99999');

  expect(result).toStrictEqual({
    content: [
      {
        type: 'text',
        text: expect.stringContaining('no record with eventID 99999 on this thread'),
      },
    ],
    isError: true,
  });

  const kinds = await ctx.readKinds();

  expect(kinds).not.toContain('policy.action_proposed');
});

test('it refuses a queued action that has not run, and writes no proposal', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });
  const result = await ctx.callTool(String(action.queued_sequence));

  expect(result).toStrictEqual({
    content: [
      {
        type: 'text',
        text: expect.stringContaining(
          'that record is a queued action that has not run: cancel it or wait for it to run',
        ),
      },
    ],
    isError: true,
  });

  const kinds = await ctx.readKinds();

  expect(kinds).not.toContain('policy.action_proposed');
});

test('it writes a proposal for a record it can remove, under the starter rules', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeRecord('owner_message');
  const result = await ctx.callTool(`#${String(sequence)}`);

  expect(result).toMatchObject({ isError: false });

  const kinds = await ctx.readKinds();

  expect(kinds).toContain('policy.action_proposed');
});

test('it refuses at run time what became unremovable after the ask, with the same sentence', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeRecord('memory.image_offered');
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });

  const response = await ctx.forget.connector.run({
    actionID: action.action_id,
    tool: 'log.forget',
    arguments: { record: String(sequence) },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: action.action_id,
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(response).toStrictEqual({
    kind: 'refused',
    reason: 'nixie cannot remove a memory.image_offered record',
  });
});

test('it removes the record and answers with its eventID and kind, never its text', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeRecord('owner_message');
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });

  const response = await ctx.forget.connector.run({
    actionID: action.action_id,
    tool: 'log.forget',
    arguments: { record: String(sequence) },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: action.action_id,
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(response).toStrictEqual({
    kind: 'success',
    result: { removed: String(sequence), kind: 'owner_message', backup: 'pending' },
  });
});

test('it answers not found to a check before the forget started, and found with the same result after it', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeRecord('owner_message');
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });

  const attempt = {
    actionID: action.action_id,
    tool: 'log.forget',
    arguments: { record: String(sequence) },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: action.action_id,
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  };

  const before = await ctx.forget.connector.check?.(attempt);

  await ctx.forget.connector.run(attempt);

  const after = await ctx.forget.connector.check?.(attempt);

  expect(before).toStrictEqual({ kind: 'not_found' });

  expect(after).toStrictEqual({
    kind: 'found',
    result: { removed: String(sequence), kind: 'owner_message', backup: 'pending' },
  });
});

test('it answers not found to a check after a forget that started and failed in its cleanup, and found once a retry finishes it', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeRecord('owner_message');
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });

  const failing = buildLogForgetTool({
    ...ctx.context,
    readSessionCleanup: () => () => Promise.reject(new Error('cleanup failed')),
  });

  const attempt = {
    actionID: action.action_id,
    tool: 'log.forget',
    arguments: { record: String(sequence) },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: action.action_id,
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  };

  const failed = await failing.connector.run(attempt).catch((error: unknown) => error);
  const afterFailure = await ctx.forget.connector.check?.(attempt);

  await ctx.forget.connector.run(attempt);

  const afterRetry = await ctx.forget.connector.check?.(attempt);

  expect(failed).toHaveProperty('message', 'cleanup failed');
  expect(afterFailure).toStrictEqual({ kind: 'not_found' });

  expect(afterRetry).toStrictEqual({
    kind: 'found',
    result: { removed: String(sequence), kind: 'owner_message', backup: 'pending' },
  });
});
