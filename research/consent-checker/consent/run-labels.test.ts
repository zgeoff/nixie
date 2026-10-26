// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
import { expect, mock, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import type { CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { runLabels } from './run-labels.ts';
import type { PaidReply } from './run-paid-query.ts';
import type { LabelRecord, Reservation } from './types.ts';

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
    appendReservation: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: 0,
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
        inputSHA256: '3c3867a081e555f572a63aa86b58a9daf1d85d2a28aa9cab83221b4e5caace1b',
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

test('it reserves the spend of a turn before it labels the turn', async () => {
  const ctx = setupTest();

  const appendReservation = mock<(reservation: Reservation) => Promise<void>>(() =>
    Promise.resolve(),
  );

  await runLabels({
    turns: [
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'pin it', spans: [] }],
        calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
      },
    ],
    done: [],
    appendReservation,
    appendRecord: ctx.appendRecord,
    reserveUSD: 0.1,
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
      Promise.resolve({ kind: 'failed', reason: 'error_during_execution', costUSD: 0.01 }),
  });

  expect(appendReservation.mock.calls).toStrictEqual([
    [{ reservedFor: 'step 7', reserveUSD: 0.1 }],
  ]);
});

test('it counts the reservation a crashed run left toward the budget', async () => {
  const ctx = setupTest();

  const runLabel = mock<(request: CheckRequest) => Promise<PaidReply>>(() =>
    Promise.resolve({ kind: 'failed', reason: 'error_during_execution', costUSD: 0 }),
  );

  const result = await runLabels({
    turns: [
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'pin it', spans: [] }],
        calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
      },
    ],
    done: [{ reservedFor: 'step 7', reserveUSD: 1 }],
    appendReservation: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: 0.1,
    profile: {
      model: 'claude-opus-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'medium',
      authHeader: 'bearer',
    },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 1,
    limit: null,
    concurrency: 1,
    runLabel,
  });

  expect(result).toStrictEqual({
    ran: 0,
    skipped: 0,
    costUSD: 1,
    isStoppedAtBudget: true,
    isStoppedByFailure: false,
  });

  expect(runLabel).not.toHaveBeenCalled();
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
    appendReservation: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: 0,
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
    appendReservation: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: 0,
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
        inputSHA256: '58cc29ff2e428550c1280647ca0fce1e5066cfb024fcc08532dd324d95050774',
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
    appendReservation: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: 0,
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
        inputSHA256: '58cc29ff2e428550c1280647ca0fce1e5066cfb024fcc08532dd324d95050774',
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
        inputSHA256: '58cc29ff2e428550c1280647ca0fce1e5066cfb024fcc08532dd324d95050774',
        labels: [],
        failure: 'no_output',
        costUSD: 0.5,
      },
    ],
    appendReservation: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: 0,
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
        inputSHA256: '58cc29ff2e428550c1280647ca0fce1e5066cfb024fcc08532dd324d95050774',
        labels: [{ caseID: '7/9', label: 'asked', reason: 'the owner asked to pin it' }],
        failure: null,
        costUSD: 0.03,
      },
    ],
    appendReservation: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: 0,
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

test('it labels a turn again when its saved labels judged another input under the same step', async () => {
  const ctx = setupTest();

  const runLabel = mock<(request: CheckRequest) => Promise<PaidReply>>(() =>
    Promise.resolve({
      kind: 'answer',
      output: { calls: [{ call: 1, reason: 'the owner asked to pin it', label: 'asked' }] },
      costUSD: 0.25,
      durationMs: 900,
      apiMs: 800,
    }),
  );

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
        inputSHA256: 'hash-of-an-older-turn',
        labels: [{ caseID: '7/9', label: 'not_asked', reason: 'the owner asked for nothing' }],
        failure: null,
        costUSD: 0.5,
      },
    ],
    appendReservation: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: 0,
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

  expect(runLabel).toHaveBeenCalledTimes(1);
  expect(result.costUSD).toBe(0.75);
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
          inputSHA256: 'hash-i',
          labels: [],
          failure: null,
          costUSD: 0.03,
        },
      ],
      appendReservation: () => Promise.resolve(),
      appendRecord: async () => {},
      reserveUSD: 0,
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
