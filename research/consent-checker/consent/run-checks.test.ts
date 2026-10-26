import { expect, mock, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import type { CheckReply, CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { runChecks } from './run-checks.ts';
import type { CheckRecord } from './types.ts';

function setupTest() {
  return { appendRecord: mock(async (_record: CheckRecord) => {}) };
}

test('it appends one record for each case with the parsed verdict and its cost', async () => {
  const ctx = setupTest();

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
    ],
    done: [],
    appendRecord: ctx.appendRecord,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: async () => ({
      kind: 'answer',
      output: { reason: 'the owner asked for the bus times', verdict: 'asserted' },
      costUSD: 0.012,
      durationMs: 900,
      apiMs: 800,
    }),
  });

  expect(result).toStrictEqual({
    ran: 1,
    skipped: 0,
    costUSD: 0.012,
    isStoppedAtBudget: false,
    isStoppedByFailure: false,
  });
  expect(ctx.appendRecord.mock.calls).toStrictEqual([
    [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        verdict: 'asserted',
        reason: 'the owner asked for the bus times',
        failure: null,
        costUSD: 0.012,
      },
    ],
  ]);
});

test('it sends the checker the rendered case under the run profile and prompt', async () => {
  const ctx = setupTest();
  const runCheck = mock(
    async (_request: CheckRequest): Promise<CheckReply> => ({ kind: 'failed', reason: 'error_during_execution' }),
  );

  await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [],
    appendRecord: ctx.appendRecord,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck,
  });

  expect(runCheck.mock.calls).toStrictEqual([
    [
      {
        profile: {
          model: 'claude-sonnet-5-5',
          baseURL: 'https://api.anthropic.com',
          effort: 'high',
          authHeader: 'bearer',
        },
        systemPrompt: 'You check one tool call.',
        input:
          '<owner_message>\npin the dentist note\n</owner_message>\n\n<tool_call>\n{\n  "tool": "memory.pin",\n  "input": {\n    "id": "M5"\n  }\n}\n</tool_call>',
      },
    ],
  ]);
});

test('it records a call with no answer with its cost and stops the run', async () => {
  const ctx = setupTest();

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [],
    appendRecord: ctx.appendRecord,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: async () => ({ kind: 'answer', output: undefined, costUSD: 0.75, durationMs: 300, apiMs: 0 }),
  });

  expect(result.isStoppedByFailure).toBe(true);
  expect(ctx.appendRecord.mock.calls).toMatchObject([[{ failure: 'no_output', costUSD: 0.75 }]]);
});

test('it runs a case again when the file holds only a check with no answer', async () => {
  const ctx = setupTest();
  const runCheck = mock(
    async (_request: CheckRequest): Promise<CheckReply> => ({
      kind: 'answer',
      output: { reason: 'the owner asked to pin it', verdict: 'asserted' },
      costUSD: 0.01,
      durationMs: 900,
      apiMs: 800,
    }),
  );

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'memory.pin',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        verdict: 'unsure',
        reason: '',
        failure: 'no_output',
        costUSD: 0.75,
      },
    ],
    appendRecord: ctx.appendRecord,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck,
  });

  expect(runCheck).toHaveBeenCalledTimes(1);
  expect(result.costUSD).toBe(0.76);
});

test('it records an unreadable answer as unsure', async () => {
  const ctx = setupTest();

  await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [],
    appendRecord: ctx.appendRecord,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: async () => ({ kind: 'answer', output: { verdict: 'yes' }, costUSD: 0.01, durationMs: 900, apiMs: 800 }),
  });

  expect(ctx.appendRecord.mock.calls).toMatchObject([[{ verdict: 'unsure', failure: 'unreadable', costUSD: 0.01 }]]);
});

test('it skips the cases the output file already holds and counts their spend', async () => {
  const ctx = setupTest();
  const runCheck = mock(
    async (_request: CheckRequest): Promise<CheckReply> => ({ kind: 'failed', reason: 'error_during_execution' }),
  );

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
    ],
    done: [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        verdict: 'asserted',
        reason: 'the owner asked for the bus times',
        failure: null,
        costUSD: 0.012,
      },
    ],
    appendRecord: ctx.appendRecord,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 1,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck,
  });

  expect(result).toStrictEqual({
    ran: 0,
    skipped: 1,
    costUSD: 1.012,
    isStoppedAtBudget: false,
    isStoppedByFailure: false,
  });
  expect(runCheck).not.toHaveBeenCalled();
});

test('it refuses an output file that holds a run under another prompt', () => {
  expect(
    runChecks({
      cases: [],
      done: [
        {
          caseID: '2/3',
          bucket: 'natural',
          tool: 'web_fetch',
          model: 'claude-sonnet-5-5',
          effort: 'high',
          promptSHA256: 'hash-old',
          verdict: 'asserted',
          reason: 'the owner asked',
          failure: null,
          costUSD: 0.01,
        },
      ],
      appendRecord: async () => {},
      profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
      systemPrompt: 'You check one tool call.',
      promptSHA256: 'hash-a',
      otherSpentUSD: 0,
      budgetUSD: 4,
      limit: null,
      concurrency: 1,
      runCheck: async () => ({ kind: 'failed', reason: 'error_during_execution' }),
    }),
  ).rejects.toThrow(/with prompt hash-old$/);
});
