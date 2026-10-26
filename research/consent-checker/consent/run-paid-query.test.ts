import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPaidQuery } from './run-paid-query.ts';
import { buildStubPaidSession } from './test-utils/build-stub-paid-session.ts';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'consent-paid-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  return { home, env: { HOME: home, ANTHROPIC_AUTH_TOKEN: 'test-token' } };
}

test('it gives the answer of a result that succeeded with its cost and timings', async () => {
  const ctx = await setupTest();

  const stub = buildStubPaidSession([
    { type: 'system', subtype: 'init' },
    {
      type: 'result',
      subtype: 'success',
      total_cost_usd: 0.03,
      duration_ms: 4000,
      duration_api_ms: 3800,
      structured_output: { verdict: 'asserted', reason: 'the owner asked' },
    },
  ]);

  const reply = await runPaidQuery(
    {
      profile: {
        model: 'claude-sonnet-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'high',
        authHeader: 'bearer',
      },
      systemPrompt: 'You check one tool call.',
      input: 'look up the ferry times',
    },
    { env: ctx.env, runQuery: () => stub.session },
  );

  expect(reply).toStrictEqual({
    kind: 'answer',
    output: { verdict: 'asserted', reason: 'the owner asked' },
    costUSD: 0.03,
    durationMs: 4000,
    apiMs: 3800,
  });
});

test('it keeps the cost of a result that failed', async () => {
  const ctx = await setupTest();

  const stub = buildStubPaidSession([
    {
      type: 'result',
      subtype: 'error_max_structured_output_retries',
      total_cost_usd: 0.02,
      duration_ms: 9000,
      duration_api_ms: 8700,
    },
  ]);

  const reply = await runPaidQuery(
    {
      profile: {
        model: 'claude-sonnet-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'high',
        authHeader: 'bearer',
      },
      systemPrompt: 'You check one tool call.',
      input: 'look up the ferry times',
    },
    { env: ctx.env, runQuery: () => stub.session },
  );

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'error_max_structured_output_retries',
    costUSD: 0.02,
  });
});

test('it gives no known cost for a query that ended with no result', async () => {
  const ctx = await setupTest();

  const stub = buildStubPaidSession([{ type: 'system', subtype: 'init' }]);

  const reply = await runPaidQuery(
    {
      profile: {
        model: 'claude-sonnet-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'high',
        authHeader: 'bearer',
      },
      systemPrompt: 'You check one tool call.',
      input: 'look up the ferry times',
    },
    { env: ctx.env, runQuery: () => stub.session },
  );

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the query ended with no result',
    costUSD: null,
  });
});

test('it sends the input under the check guest options and closes the session', async () => {
  const ctx = await setupTest();

  const stub = buildStubPaidSession([]);
  const prompts: string[] = [];
  const systemPrompts: unknown[] = [];

  await runPaidQuery(
    {
      profile: {
        model: 'claude-sonnet-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'high',
        authHeader: 'bearer',
      },
      systemPrompt: 'You check one tool call.',
      input: 'look up the ferry times',
    },
    {
      env: ctx.env,
      runQuery: (params) => {
        prompts.push(params.prompt);
        systemPrompts.push(params.options.systemPrompt);

        return stub.session;
      },
    },
  );

  expect(prompts).toStrictEqual(['look up the ferry times']);
  expect(systemPrompts).toStrictEqual(['You check one tool call.']);
  expect(stub.isClosed()).toBe(true);
});
