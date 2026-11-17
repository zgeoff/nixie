import { expect, test } from 'bun:test';
import type { BudgetsContext } from '@heynixie/budgets';
import { buildBuiltInBudgets, readBudgetLedger } from '@heynixie/budgets';
import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { buildActionHash } from '@heynixie/policy';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry } from '../build-tool-registry';
import { findToolDeclaration } from '../policy-call/find-tool-declaration';
import type { ToolCallOptions } from '../run-tool-call';
import { runToolCall } from '../run-tool-call';
import { buildMockToolDefinition } from '../test-utils/build-mock-tool-definition';
import { buildMockVariantToolDefinition } from '../test-utils/build-mock-variant-tool-definition';
import { buildStubActionQueue } from '../test-utils/build-stub-action-queue';
import { setupTestLog } from '../test-utils/setup-test-log';
import type { PaidTool, ToolContext, ToolDefinition, ToolOutcome, ToolRun } from '../types';
import { runApprovedCall } from './run-approved-call';

interface ApprovalOverrides {
  readonly input?: JSONObject;
  readonly tool?: string;
}

// A direct tool that asks, so its call is stored and waits for the owner.
async function setupTest(outcome?: ToolOutcome, paid?: PaidTool) {
  const run: ToolRun = {
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_wipe'],
    model: { model: 'model-a', profile: 'chat-direct' },
    stepRunID: 'task-1@1',
  };

  const actionHash = buildActionHash({
    tool: 'notes_wipe',
    input: { query: 'old' },
    destinations: [],
    deadlineAt: null,
  });

  const testLog = await setupTestLog();

  const contexts: ToolContext[] = [];

  const tool: ToolDefinition = buildMockToolDefinition({
    name: 'notes_wipe',
    ...(paid === undefined ? {} : { paid }),
    declaration: { effects: ['export'], results: { text: 'untrusted' } },
    run: (_call, context) => {
      contexts.push(context);

      return Promise.resolve(outcome ?? { status: 'ok', result: { text: 'wiped' } });
    },
  });

  const registry = buildToolRegistry([tool]);

  const budgets: BudgetsContext = {
    log: testLog.log,
    clock: testLog.log.writer.clock,
    zone: 'UTC',
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    builtIn: buildBuiltInBudgets(['notes_wipe']),
  };

  const options: ToolCallOptions = {
    registry,
    decide: readStarterDecisionPoint((name) => findToolDeclaration(registry, name)),
    log: testLog.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    queue: buildStubActionQueue().queue,
    queuedWaitMs: 10_000,
    budgets,
  };

  await runToolCall(
    { tool: 'notes_wipe', input: { query: 'old' }, toolUseID: 'toolu_1' },
    run,
    options,
  );

  return {
    options,
    budgets,
    log: testLog.log,
    contexts,
    readRecords: async () => {
      const entries = await readRecords(testLog.log, { afterSequence: 0 });

      return entries.map((entry) => entry.record);
    },
    run,
    approve: (overrides: ApprovalOverrides) =>
      runApprovedCall(
        {
          actionID: 'proposal-1',
          tool: overrides.tool ?? 'notes_wipe',
          input: overrides.input ?? { query: 'old' },
          callSequence: 1,
          actionHash,
        },
        run,
        options,
      ),
  };
}

test('it runs the approved call once, with the step run and the sequence of the stored call', async () => {
  const ctx = await setupTest();

  await ctx.approve({});

  expect(ctx.contexts).toStrictEqual([{ run: ctx.run, callSequence: 1 }]);
});

test('it writes the result as the call answers under the approval, naming the action', async () => {
  const ctx = await setupTest();
  const approved = await ctx.approve({});
  const records = await ctx.readRecords();

  const [called] = records;
  const result = records.at(3);

  expect(approved).toStrictEqual({
    status: 'done',
    resultSequence: 4,
    result: { text: 'wiped' },
    images: [],
  });

  expect(result).toMatchObject({
    kind: 'tool_result',
    parent: 1,
    thread: 'task-1',
    contentSource: 'untrusted',
    payload: {
      outcome: 'result',
      actionID: 'proposal-1',
      sources: { text: 'untrusted' },
    },
    erasable: { status: 'readable', fields: { result: { text: 'wiped' } } },
  });

  expect(result?.payload['callID']).toBe(called?.payload['callID']);
});

test('it fails the call of a tool that errored, and writes the error as the result', async () => {
  const ctx = await setupTest({ status: 'error', message: 'the file service said no' });
  const approved = await ctx.approve({});
  const records = await ctx.readRecords();

  expect(approved).toStrictEqual({ status: 'failed', resultSequence: 4 });

  expect(records[3]).toMatchObject({
    contentSource: 'untrusted',
    payload: { outcome: 'error', actionID: 'proposal-1' },
    erasable: { status: 'readable', fields: { message: 'the file service said no' } },
  });
});

test('it runs nothing when the arguments differ from the approved call', async () => {
  const ctx = await setupTest();
  const approved = await ctx.approve({ input: { query: 'new' } });
  const records = await ctx.readRecords();

  expect(approved).toStrictEqual({ status: 'changed' });
  expect(ctx.contexts).toStrictEqual([]);

  expect(records.map((record) => record.kind)).toStrictEqual([
    'tool_called',
    'policy.action_proposed',
    'tool_result',
  ]);
});

test('it runs nothing for a tool the registry does not hold', async () => {
  const ctx = await setupTest();
  const approved = await ctx.approve({ tool: 'notes_gone' });

  expect(approved).toStrictEqual({ status: 'unavailable' });
  expect(ctx.contexts).toStrictEqual([]);
});

test("it marks the result of an approved variant call with the sources of that variant's own declaration", async () => {
  const testLog = await setupTestLog();

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['jobs_start'],
    model: { model: 'model-a', profile: 'chat-direct' },
    stepRunID: 'task-1@1',
  };

  const tool = buildMockVariantToolDefinition({
    declaration: { effects: ['export'], results: { text: 'owner_data' } },
    variants: {
      pick: () => 'risky',
      declarations: {
        risky: {
          effects: ['export'],
          destinations: [],
          amount: null,
          content: [],
          results: { text: 'untrusted' },
        },
      },
    },
    run: () => Promise.resolve({ status: 'ok', result: { text: 'a page said hello' } }),
  });

  const registry = buildToolRegistry([tool]);

  const options: ToolCallOptions = {
    registry,
    decide: readStarterDecisionPoint((name) => findToolDeclaration(registry, name)),
    log: testLog.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    queue: buildStubActionQueue().queue,
    queuedWaitMs: 10_000,
  };

  const input = { kind: 'risky', query: 'hello' };

  await runToolCall({ tool: 'jobs_start', input, toolUseID: 'toolu_1' }, run, options);

  const approved = await runApprovedCall(
    {
      actionID: 'proposal-1',
      tool: 'jobs_start',
      input,
      callSequence: 1,
      actionHash: buildActionHash({
        tool: 'jobs_start',
        input,
        destinations: [],
        deadlineAt: null,
      }),
    },
    run,
    options,
  );

  const entries = await readRecords(testLog.log, { afterSequence: 0 });

  const result = entries.map((entry) => entry.record).at(-1);

  expect(approved).toMatchObject({ status: 'done' });

  expect(result).toMatchObject({
    kind: 'tool_result',
    contentSource: 'untrusted',
    payload: { actionID: 'proposal-1', sources: { text: 'untrusted' } },
  });
});

test('it charges the approved call of a paid tool once, before it runs', async () => {
  const ctx = await setupTest(undefined, { priceMicros: 40_000 });

  await ctx.approve({});

  const day = await readBudgetLedger(ctx.log.writer.db, ctx.budgets, 'notes_wipe-day');

  expect(day).toMatchObject({ spentMicros: 40_000 });
});

test('it refuses the approved call of a paid tool whose budget is full, and runs nothing', async () => {
  const ctx = await setupTest(undefined, { priceMicros: 6_000_000 });
  const approved = await ctx.approve({});

  expect(approved).toStrictEqual({ status: 'failed', resultSequence: 4 });
  expect(ctx.contexts).toStrictEqual([]);
});
