import { expect, test } from 'bun:test';
import { runPaidQuery } from './run-paid-query.ts';
import { buildStubPaidSession } from './test-utils/build-stub-paid-session.ts';

test('it gives the answer of a result that succeeded with its cost and timings', async () => {
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
    {
      env: { HOME: '/home/checker-test', ANTHROPIC_AUTH_TOKEN: 'test-token' },
      runQuery: () => stub.session,
      createDirectory: () => Promise.resolve(),
    },
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
    {
      env: { HOME: '/home/checker-test', ANTHROPIC_AUTH_TOKEN: 'test-token' },
      runQuery: () => stub.session,
      createDirectory: () => Promise.resolve(),
    },
  );

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'error_max_structured_output_retries',
    costUSD: 0.02,
  });
});

test('it gives no known cost for a query that ended with no result', async () => {
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
    {
      env: { HOME: '/home/checker-test', ANTHROPIC_AUTH_TOKEN: 'test-token' },
      runQuery: () => stub.session,
      createDirectory: () => Promise.resolve(),
    },
  );

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the query ended with no result',
    costUSD: null,
  });
});

test('it creates the check folder under the home before it starts the query', async () => {
  const stub = buildStubPaidSession([]);
  const events: string[] = [];

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
      env: { HOME: '/home/checker-test', ANTHROPIC_AUTH_TOKEN: 'test-token' },
      runQuery: () => {
        events.push('query');

        return stub.session;
      },
      createDirectory: (path) => {
        events.push(`create ${path}`);

        return Promise.resolve();
      },
    },
  );

  expect(events).toStrictEqual(['create /home/checker-test/checker', 'query']);
});

test('it sends the input under the check guest options and closes the session', async () => {
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
      env: { HOME: '/home/checker-test', ANTHROPIC_AUTH_TOKEN: 'test-token' },
      runQuery: (params) => {
        prompts.push(params.prompt);
        systemPrompts.push(params.options.systemPrompt);

        return stub.session;
      },
      createDirectory: () => Promise.resolve(),
    },
  );

  expect(prompts).toStrictEqual(['look up the ferry times']);
  expect(systemPrompts).toStrictEqual(['You check one tool call.']);
  expect(stub.isClosed()).toBe(true);
});
