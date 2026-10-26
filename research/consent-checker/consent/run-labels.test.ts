// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
import { expect, mock, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import type { CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { runLabels } from './run-labels.ts';
import type { PaidReply } from './run-paid-query.ts';
import type { LabelRecord } from './types.ts';

function setupTest() {
  return { appendRecord: mock<(record: LabelRecord) => Promise<void>>(() => Promise.resolve()) };
}

test('it maps each numbered answer to its pair and marks a pair the answer left out as unsure', async () => {
  const ctx = setupTest();

  const result = await runLabels({
    turns: [
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'save that the plumber comes Thursday', spans: [] }],
        calls: [
          { caseID: '7/8', tool: 'memory.remember', input: { text: 'The plumber comes Thursday' } },
          { caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } },
        ],
      },
    ],
    done: [],
    appendRecord: ctx.appendRecord,
    profile: {
      model: 'claude-opus-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'medium',
      authHeader: 'bearer',
    },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: () =>
      Promise.resolve({
        kind: 'answer',
        output: { calls: [{ call: 1, reason: 'the owner asked to save it', label: 'asked' }] },
        costUSD: 0.03,
        durationMs: 4000,
        apiMs: 3800,
      }),
  });

  expect(result.ran).toBe(1);

  expect(ctx.appendRecord.mock.calls).toStrictEqual([
    [
      {
        stepSequence: 7,
        model: 'claude-opus-5-5',
        effort: 'medium',
        promptSHA256: 'hash-l',
        labels: [
          { caseID: '7/8', label: 'asked', reason: 'the owner asked to save it' },
          { caseID: '7/9', label: 'unsure', reason: 'the answer left this call out' },
        ],
        failure: null,
        costUSD: 0.03,
      },
    ],
  ]);
});

test('it sends the labeller the rendered turn under the run profile and prompt', async () => {
  const ctx = setupTest();

  const runLabel = mock<(request: CheckRequest) => Promise<PaidReply>>(() =>
    Promise.resolve({
      kind: 'failed',
      reason: 'error_during_execution',
      costUSD: 0,
    }),
  );

  await runLabels({
    turns: [
      {
        stepSequence: 7,
        earlier: [
          { role: 'owner', text: 'when does the plumber come' },
          { role: 'assistant', text: 'I have no date for the plumber yet.' },
        ],
        messages: [{ sequence: 6, text: 'save that the plumber comes Thursday', spans: [] }],
        calls: [
          { caseID: '7/8', tool: 'memory.remember', input: { text: 'The plumber comes Thursday' } },
          { caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } },
        ],
      },
    ],
    done: [],
    appendRecord: ctx.appendRecord,
    profile: {
      model: 'claude-opus-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'medium',
      authHeader: 'bearer',
    },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel,
  });

  expect(runLabel.mock.calls).toStrictEqual([
    [
      {
        profile: {
          model: 'claude-opus-5-5',
          baseURL: 'https://api.anthropic.com',
          effort: 'medium',
          authHeader: 'bearer',
        },
        systemPrompt: 'You label tool calls.',
        input:
          '<earlier>\n<owner>\nwhen does the plumber come\n</owner>\n<assistant>\nI have no date for the plumber yet.\n</assistant>\n</earlier>\n\n<turn>\n<owner_message>\nsave that the plumber comes Thursday\n</owner_message>\n</turn>\n\n<calls>\n<tool_call number="1">\n{\n  "tool": "memory.remember",\n  "input": {\n    "text": "The plumber comes Thursday"\n  }\n}\n</tool_call>\n<tool_call number="2">\n{\n  "tool": "memory.pin",\n  "input": {\n    "id": "M3"\n  }\n}\n</tool_call>\n</calls>',
      },
    ],
  ]);
});

test('it records a call with no answer with its cost and no label, and stops the run', async () => {
  const ctx = setupTest();

  const result = await runLabels({
    turns: [
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'pin it', spans: [] }],
        calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
      },
    ],
    done: [],
    appendRecord: ctx.appendRecord,
    profile: {
      model: 'claude-opus-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'medium',
      authHeader: 'bearer',
    },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: () =>
      Promise.resolve({
        kind: 'answer',
        output: undefined,
        costUSD: 0.4,
        durationMs: 300,
        apiMs: 0,
      }),
  });

  expect(result.isStoppedByFailure).toBe(true);

  expect(ctx.appendRecord.mock.calls).toStrictEqual([
    [
      {
        stepSequence: 7,
        model: 'claude-opus-5-5',
        effort: 'medium',
        promptSHA256: 'hash-l',
        labels: [],
        failure: 'no_output',
        failureReason: 'the answer held no output',
        costUSD: 0.4,
      },
    ],
  ]);
});

test('it keeps the reason and the cost a failed query gave in its record and in the result', async () => {
  const ctx = setupTest();

  const result = await runLabels({
    turns: [
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'pin it', spans: [] }],
        calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
      },
    ],
    done: [],
    appendRecord: ctx.appendRecord,
    profile: {
      model: 'claude-opus-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'medium',
      authHeader: 'bearer',
    },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: () => Promise.resolve({ kind: 'failed', reason: 'error_max_turns', costUSD: 0.02 }),
  });

  expect(result.failureReason).toBe('error_max_turns');
  expect(result.costUSD).toBe(0.02);

  expect(ctx.appendRecord.mock.calls).toStrictEqual([
    [
      {
        stepSequence: 7,
        model: 'claude-opus-5-5',
        effort: 'medium',
        promptSHA256: 'hash-l',
        labels: [],
        failure: 'no_output',
        failureReason: 'error_max_turns',
        costUSD: 0.02,
      },
    ],
  ]);
});

test('it labels a turn again when the file holds only a record with no answer for it', async () => {
  const ctx = setupTest();

  const result = await runLabels({
    turns: [
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'pin it', spans: [] }],
        calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
      },
    ],
    done: [
      {
        stepSequence: 7,
        model: 'claude-opus-5-5',
        effort: 'medium',
        promptSHA256: 'hash-l',
        labels: [],
        failure: 'no_output',
        costUSD: 0.5,
      },
    ],
    appendRecord: ctx.appendRecord,
    profile: {
      model: 'claude-opus-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'medium',
      authHeader: 'bearer',
    },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: () =>
      Promise.resolve({
        kind: 'answer',
        output: { calls: [{ call: 1, reason: 'the owner asked to pin it', label: 'asked' }] },
        costUSD: 0.25,
        durationMs: 4000,
        apiMs: 3800,
      }),
  });

  expect(result).toStrictEqual({
    ran: 1,
    skipped: 0,
    costUSD: 0.75,
    isStoppedAtBudget: false,
    isStoppedByFailure: false,
  });
});

test('it skips labelled turns and counts their spend with the other calls', async () => {
  const ctx = setupTest();

  const result = await runLabels({
    turns: [
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'pin it', spans: [] }],
        calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
      },
    ],
    done: [
      {
        stepSequence: 7,
        model: 'claude-opus-5-5',
        effort: 'medium',
        promptSHA256: 'hash-l',
        labels: [{ caseID: '7/9', label: 'asked', reason: 'the owner asked to pin it' }],
        failure: null,
        costUSD: 0.03,
      },
    ],
    appendRecord: ctx.appendRecord,
    profile: {
      model: 'claude-opus-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'medium',
      authHeader: 'bearer',
    },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0.5,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: () =>
      Promise.resolve({ kind: 'failed', reason: 'error_during_execution', costUSD: 0 }),
  });

  expect(result).toStrictEqual({
    ran: 0,
    skipped: 1,
    costUSD: 0.53,
    isStoppedAtBudget: false,
    isStoppedByFailure: false,
  });
});

test('it refuses an output file that holds a run under another model', () => {
  expect(
    runLabels({
      turns: [],
      done: [
        {
          stepSequence: 7,
          model: 'claude-sonnet-5-5',
          effort: 'medium',
          promptSHA256: 'hash-l',
          labels: [],
          failure: null,
          costUSD: 0.03,
        },
      ],
      appendRecord: async () => {},
      profile: {
        model: 'claude-opus-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'medium',
        authHeader: 'bearer',
      },
      systemPrompt: 'You label tool calls.',
      promptSHA256: 'hash-l',
      otherSpentUSD: 0,
      budgetUSD: 4,
      limit: null,
      concurrency: 1,
      runLabel: () =>
        Promise.resolve({ kind: 'failed', reason: 'error_during_execution', costUSD: 0 }),
    }),
  ).rejects.toThrow(/holds a run of claude-sonnet-5-5/u);
});
