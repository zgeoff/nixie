import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @boundaries-ignore a spike imports the code it measures
import type { CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { runChecks } from './run-checks.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'consent-checks-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it appends one record for each case with the parsed verdict and its cost', async () => {
  const ctx = await setupTest();
  const outPath = join(ctx.dir, 'checks.jsonl');

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
    ],
    done: [],
    outPath,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    budgetUSD: 4,
    concurrency: 1,
    runCheck: async () => ({
      kind: 'answer',
      output: { reason: 'the owner asked for the bus times', verdict: 'asserted' },
      costUSD: 0.012,
      durationMs: 900,
      apiMs: 800,
    }),
  });

  expect(result).toStrictEqual({ ran: 1, skipped: 0, costUSD: 0.012, isStoppedAtBudget: false });
  expect((await readFile(outPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))).toStrictEqual([
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
  ]);
});

test('it sends the checker the rendered case under the run profile and prompt', async () => {
  const ctx = await setupTest();
  const runCheck = mock(async (_request: CheckRequest) => ({
    kind: 'failed' as const,
    reason: 'error_during_execution',
  }));

  await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [],
    outPath: join(ctx.dir, 'checks.jsonl'),
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    budgetUSD: 4,
    concurrency: 1,
    runCheck,
  });

  expect(runCheck.mock.calls).toStrictEqual([
    [
      {
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    input:
      '<owner_message>\npin the dentist note\n</owner_message>\n\n<tool_call>\n{\n  "tool": "memory.pin",\n  "input": {\n    "id": "M5"\n  }\n}\n</tool_call>',
      },
    ],
  ]);
});

test('it records a failed call as unsure with its failure and no cost', async () => {
  const ctx = await setupTest();
  const outPath = join(ctx.dir, 'checks.jsonl');

  await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [],
    outPath,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    budgetUSD: 4,
    concurrency: 1,
    runCheck: async () => ({ kind: 'failed', reason: 'error_during_execution' }),
  });

  expect(JSON.parse(await readFile(outPath, 'utf8'))).toMatchObject({
    verdict: 'unsure',
    failure: 'error_during_execution',
    costUSD: 0,
  });
});

test('it records an unreadable answer as unsure', async () => {
  const ctx = await setupTest();
  const outPath = join(ctx.dir, 'checks.jsonl');

  await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [],
    outPath,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    budgetUSD: 4,
    concurrency: 1,
    runCheck: async () => ({ kind: 'answer', output: { verdict: 'yes' }, costUSD: 0.01, durationMs: 900, apiMs: 800 }),
  });

  expect(JSON.parse(await readFile(outPath, 'utf8'))).toMatchObject({
    verdict: 'unsure',
    failure: 'unreadable',
    costUSD: 0.01,
  });
});

test('it skips the cases the output file already holds', async () => {
  const ctx = await setupTest();
  const runCheck = mock(async (_request: CheckRequest) => ({
    kind: 'failed' as const,
    reason: 'error_during_execution',
  }));

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ text: 'check the bus times', spans: [] }],
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
    outPath: join(ctx.dir, 'checks.jsonl'),
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    budgetUSD: 4,
    concurrency: 1,
    runCheck,
  });

  expect(result).toStrictEqual({ ran: 0, skipped: 1, costUSD: 0.012, isStoppedAtBudget: false });
  expect(runCheck).not.toHaveBeenCalled();
});

test('it starts no call once the spend reaches the budget', async () => {
  const ctx = await setupTest();
  const outPath = join(ctx.dir, 'checks.jsonl');

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
      {
        caseID: '6/7',
        bucket: 'natural',
        stepSequence: 6,
        messages: [{ text: 'and the train times', spans: [] }],
        call: { sequence: 7, tool: 'web_fetch', input: { url: 'https://train.example/times' } },
      },
    ],
    done: [],
    outPath,
    profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    budgetUSD: 0.5,
    concurrency: 1,
    runCheck: async () => ({
      kind: 'answer',
      output: { reason: 'the owner asked', verdict: 'asserted' },
      costUSD: 0.6,
      durationMs: 900,
      apiMs: 800,
    }),
  });

  expect(result).toStrictEqual({ ran: 1, skipped: 0, costUSD: 0.6, isStoppedAtBudget: true });
});

test('it refuses an output file that holds a run under another prompt', async () => {
  const ctx = await setupTest();
  const outPath = join(ctx.dir, 'checks.jsonl');

  await writeFile(outPath, '');

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
      outPath,
      profile: { model: 'claude-sonnet-5-5', baseURL: 'https://api.anthropic.com', effort: 'high', authHeader: 'bearer' },
      systemPrompt: 'You check one tool call.',
      promptSHA256: 'hash-a',
      budgetUSD: 4,
      concurrency: 1,
      runCheck: async () => ({ kind: 'failed', reason: 'error_during_execution' }),
    }),
  ).rejects.toThrow(/with prompt hash-old$/);
});
