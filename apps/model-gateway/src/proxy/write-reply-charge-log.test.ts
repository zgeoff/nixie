import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import type { CountedReply } from './accounting';
import type { ReplyCharge } from './pick-reply-charge';
import { writeReplyChargeLog } from './write-reply-charge-log';

function setupTest() {
  const log = mock<Logger>(() => {});

  return {
    log,
    reply: (fields: Partial<CountedReply>): CountedReply => ({
      routeID: 'preview',
      route: {
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        provider: 'test',
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
        limits: null,
      },
      sandbox: 'alpha',
      estimate: null,
      usage: null,
      hasInput: true,
      whole: true,
      spent: true,
      reason: 'no_usage',
      ...fields,
    }),
  };
}

test.each<{ outcome: string; charge: ReplyCharge; line: Parameters<Logger> }>([
  {
    outcome: 'charged',
    charge: {
      kind: 'usage',
      spend: { dollars: 0.0123, tokens: 2310 },
      usage: {
        uncachedInputTokens: 1200,
        cacheReadTokens: 800,
        cacheWrite5mTokens: 100,
        cacheWrite1hTokens: 10,
        outputTokens: 200,
        reasoningTokens: 50,
      },
    },
    line: [
      'count.charged',
      {
        route: 'preview',
        sandbox: 'alpha',
        uncachedInputTokens: 1200,
        cacheReadTokens: 800,
        cacheWrite5mTokens: 100,
        cacheWrite1hTokens: 10,
        outputTokens: 200,
        reasoningTokens: 50,
        dollars: 0.0123,
        tokens: 2310,
      },
    ],
  },
  {
    outcome: 'estimated',
    charge: { kind: 'estimate', spend: { dollars: 0.015, tokens: 6096 } },
    line: [
      'count.estimated',
      { route: 'preview', sandbox: 'alpha', reason: 'no_usage', dollars: 0.015, tokens: 6096 },
      'warn',
    ],
  },
  {
    outcome: 'lost',
    charge: { kind: 'lost', field: 'messages.content.source' },
    line: [
      'count.lost',
      { route: 'preview', sandbox: 'alpha', field: 'messages.content.source' },
      'error',
    ],
  },
])('it writes one line for a reply whose count was $outcome', (row) => {
  const ctx = setupTest();

  writeReplyChargeLog(ctx.log, ctx.reply({}), row.charge);

  expect(ctx.log.mock.calls).toStrictEqual([row.line]);
});

test('it logs a null reasoning count for a charged reply whose usage reports none', () => {
  const ctx = setupTest();

  writeReplyChargeLog(ctx.log, ctx.reply({}), {
    kind: 'usage',
    spend: { dollars: 0.0005, tokens: 300 },
    usage: {
      uncachedInputTokens: 100,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 200,
    },
  });

  expect(ctx.log.mock.calls).toStrictEqual([
    [
      'count.charged',
      {
        route: 'preview',
        sandbox: 'alpha',
        uncachedInputTokens: 100,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 200,
        reasoningTokens: null,
        dollars: 0.0005,
        tokens: 300,
      },
    ],
  ]);
});

test('it writes nothing for a reply that spent nothing', () => {
  const ctx = setupTest();

  writeReplyChargeLog(ctx.log, ctx.reply({ spent: false }), { kind: 'none' });

  expect(ctx.log).not.toHaveBeenCalled();
});
