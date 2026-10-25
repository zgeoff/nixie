import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @boundaries-ignore a spike imports the code it measures
import type { CheckReply, CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { runChecks } from './run-checks.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'consent-checks-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { outPath: join(dir, 'checks.jsonl') };
}

test('it appends one record for each case with the parsed verdict and its cost', async () => {
  const ctx = await setupTest();

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
    outPath: ctx.outPath,
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
  expect(JSON.parse(await readFile(ctx.outPath, 'utf8'))).toStrictEqual({
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
  });
});

test('it sends the checker the rendered case under the run profile and prompt', async () => {
  const ctx = await setupTest();
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
    outPath: ctx.outPath,
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

test('it writes no record for a call with no answer and stops the run', async () => {
  const ctx = await setupTest();

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
    outPath: ctx.outPath,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: async () => ({ kind: 'answer', output: undefined, costUSD: 0, durationMs: 300, apiMs: 0 }),
  });

  expect(result.isStoppedByFailure).toBe(true);
  expect(readFile(ctx.outPath, 'utf8')).rejects.toThrow();
});

test('it records an unreadable answer as unsure', async () => {
  const ctx = await setupTest();

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
    outPath: ctx.outPath,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: async () => ({ kind: 'answer', output: { verdict: 'yes' }, costUSD: 0.01, durationMs: 900, apiMs: 800 }),
  });

  expect(JSON.parse(await readFile(ctx.outPath, 'utf8'))).toMatchObject({
    verdict: 'unsure',
    failure: 'unreadable',
    costUSD: 0.01,
  });
});

test('it skips the cases the output file already holds and counts their spend', async () => {
  const ctx = await setupTest();
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
    outPath: ctx.outPath,
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
      outPath: 'checks.jsonl',
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
