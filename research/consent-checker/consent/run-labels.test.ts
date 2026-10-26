import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLabels } from './run-labels.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'consent-labels-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { outPath: join(dir, 'labels.jsonl') };
}

test('it maps each numbered answer to its pair and marks a pair the answer left out as unsure', async () => {
  const ctx = await setupTest();

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
    outPath: ctx.outPath,
    profile: { model: 'claude-opus-5-5', baseURL: 'https://api.anthropic.com', effort: 'medium', authHeader: 'bearer' },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: async () => ({
      kind: 'answer',
      output: { calls: [{ call: 1, reason: 'the owner asked to save it', label: 'asked' }] },
      costUSD: 0.03,
      durationMs: 4000,
      apiMs: 3800,
    }),
  });

  expect(result.ran).toBe(1);
  expect(JSON.parse(await readFile(ctx.outPath, 'utf8'))).toStrictEqual({
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
  });
});

test('it labels every pair of a turn unsure when the answer is unreadable', async () => {
  const ctx = await setupTest();

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
    outPath: ctx.outPath,
    profile: { model: 'claude-opus-5-5', baseURL: 'https://api.anthropic.com', effort: 'medium', authHeader: 'bearer' },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: async () => ({ kind: 'answer', output: { calls: 'none' }, costUSD: 0.02, durationMs: 900, apiMs: 800 }),
  });

  expect(JSON.parse(await readFile(ctx.outPath, 'utf8'))).toMatchObject({
    labels: [{ caseID: '7/9', label: 'unsure', reason: 'the answer was unreadable' }],
    failure: 'unreadable',
    costUSD: 0.02,
  });
});

test('it records a call with no answer with its cost and no label, and stops the run', async () => {
  const ctx = await setupTest();

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
    outPath: ctx.outPath,
    profile: { model: 'claude-opus-5-5', baseURL: 'https://api.anthropic.com', effort: 'medium', authHeader: 'bearer' },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: async () => ({ kind: 'answer', output: undefined, costUSD: 0.4, durationMs: 300, apiMs: 0 }),
  });

  expect(result.isStoppedByFailure).toBe(true);
  expect(JSON.parse(await readFile(ctx.outPath, 'utf8'))).toMatchObject({
    labels: [],
    failure: 'no_output',
    costUSD: 0.4,
  });
});

test('it labels a turn again when the file holds only a record with no answer for it', async () => {
  const ctx = await setupTest();

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
    outPath: ctx.outPath,
    profile: { model: 'claude-opus-5-5', baseURL: 'https://api.anthropic.com', effort: 'medium', authHeader: 'bearer' },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: async () => ({
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
  const ctx = await setupTest();

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
    outPath: ctx.outPath,
    profile: { model: 'claude-opus-5-5', baseURL: 'https://api.anthropic.com', effort: 'medium', authHeader: 'bearer' },
    systemPrompt: 'You label tool calls.',
    promptSHA256: 'hash-l',
    otherSpentUSD: 0.5,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runLabel: async () => ({ kind: 'failed', reason: 'error_during_execution' }),
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
      outPath: 'labels.jsonl',
      profile: { model: 'claude-opus-5-5', baseURL: 'https://api.anthropic.com', effort: 'medium', authHeader: 'bearer' },
      systemPrompt: 'You label tool calls.',
      promptSHA256: 'hash-l',
      otherSpentUSD: 0,
      budgetUSD: 4,
      limit: null,
      concurrency: 1,
      runLabel: async () => ({ kind: 'failed', reason: 'error_during_execution' }),
    }),
  ).rejects.toThrow(/holds a run of claude-sonnet-5-5/);
});
