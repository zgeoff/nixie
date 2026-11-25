import { expect, onTestFinished, test } from 'bun:test';
import { webFetchDefaults } from '@heynixie/connectors';
import {
  buildMockPageReply,
  buildStubSandboxAdapter,
  makeStubFetcher,
} from '@heynixie/connectors/test-utils';
import type { LogFields } from '@heynixie/logger';
import { makeOwnerTypedCheck } from '@heynixie/memory';
import { writeOwnerMessageRecord } from '@heynixie/memory/test-utils';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { makeSecretFinder } from '@heynixie/secret-scan';
import { buildKey } from '@heynixie/secret-scan/test-utils';
import { startWebFetch } from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';

interface FetchOptions {
  readonly hops?: readonly string[];
  readonly covers?: 'named_url' | 'redirects';
}

async function setupTest() {
  const ownValue = buildKey('alphanumeric', 20, 9);

  const testRecorder = await setupTestRecorder();

  const log = testRecorder.log;
  const logged: { event: string; fields: LogFields | undefined }[] = [];
  const typedChecks: string[] = [];
  const check = makeOwnerTypedCheck(log);

  const run = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
  };

  return {
    ownValue,
    publicKeyURL: `https://api.example.test/v1/items?id=ghp_${buildKey('alphanumeric', 36)}`,
    logged,
    typedChecks,
    writeMessage: (text: string, typed: boolean) =>
      writeOwnerMessageRecord(log, {
        thread: 'conversation',
        text,
        spans: [{ start: 0, end: text.length, source: typed ? 'typed' : 'pasted' }],
      }),
    runFetch: async (url: string, options: FetchOptions = {}) => {
      const adapter = buildStubSandboxAdapter(
        makeStubFetcher((request) => buildMockPageReply(request.url, { text: 'The page text' }), {
          hops: options.hops ?? [],
        }),
      );

      const webFetch = startWebFetch({
        adapter,
        image: 'fetch',
        argv: ['bun', '/app/fetch.js'],
        deniedRanges: [],
        log,
        config: { ...webFetchDefaults, secretTypedURLCovers: options.covers ?? 'redirects' },
        findSecret: makeSecretFinder(() => [ownValue]),
        isOwnerTyped: (askedRun, askedURL) => {
          typedChecks.push(askedURL);

          return check(askedRun, askedURL);
        },
        logger: (event, fields) => {
          logged.push({ event, fields });
        },
      });

      onTestFinished(() => webFetch.stop());

      const outcome = await webFetch.tool.run(
        { callID: 'call-1', tool: 'web_fetch', input: { url }, toolUseID: null },
        { callSequence: 1, run },
      );

      const reread = (page: string) =>
        webFetch.tool.run(
          { callID: 'call-2', tool: 'web_fetch', input: { page, part: 1 }, toolUseID: null },
          { callSequence: 1, run },
        );

      return { outcome, adapter, reread };
    },
  };
}

test('it refuses a URL with a key that nobody typed, starts no sandbox and logs one event', async () => {
  const ctx = await setupTest();

  const url = ctx.publicKeyURL;

  const fetched = await ctx.runFetch(url);

  expect(fetched.outcome).toStrictEqual({
    status: 'error',
    message: 'the URL holds a secret (rule github-pat), so it was not fetched',
  });

  expect(fetched.adapter.created).toHaveLength(0);

  expect(ctx.logged).toStrictEqual([
    { event: 'web_fetch.secret_refused', fields: { rule: 'github-pat', hop: 0 } },
  ]);
});

test('it fetches a URL with a key that sits in a typed span, logs nothing and stores the page', async () => {
  const ctx = await setupTest();

  const url = ctx.publicKeyURL;

  await ctx.writeMessage(`please read ${url} for me`, true);

  const fetched = await ctx.runFetch(url);

  invariant(fetched.outcome.status === 'ok' && typeof fetched.outcome.result['page'] === 'string');

  expect(fetched.outcome.result).toMatchObject({ status: 200, text: 'The page text' });
  expect(ctx.logged).toStrictEqual([]);

  const reread = await fetched.reread(fetched.outcome.result['page']);

  expect(reread).toMatchObject({
    status: 'ok',
    result: { text: 'The page text' },
  });
});

test('it refuses a URL with a key that sits in a pasted span', async () => {
  const ctx = await setupTest();

  const url = ctx.publicKeyURL;

  await ctx.writeMessage(`please read ${url} for me`, false);

  const fetched = await ctx.runFetch(url);

  expect(fetched.outcome).toStrictEqual({
    status: 'error',
    message: 'the URL holds a secret (rule github-pat), so it was not fetched',
  });
});

test('it reads no owner message for a fetch that matches no rule', async () => {
  const ctx = await setupTest();

  await ctx.runFetch('https://example.test/docs', { hops: ['https://www.example.test/docs'] });

  expect(ctx.typedChecks).toStrictEqual([]);
});

test('it fetches a clean typed URL that redirects to a URL with a key, under redirects', async () => {
  const ctx = await setupTest();

  const url = 'https://example.test/docs';

  await ctx.writeMessage(`please read ${url} for me`, true);

  const fetched = await ctx.runFetch(url, { hops: [ctx.publicKeyURL], covers: 'redirects' });

  expect(fetched.outcome).toMatchObject({ status: 'ok', result: { status: 200 } });
  expect(ctx.logged).toStrictEqual([]);
});

test('it refuses a clean typed URL that redirects to a URL with a key, under named_url', async () => {
  const ctx = await setupTest();

  const url = 'https://example.test/docs';

  await ctx.writeMessage(`please read ${url} for me`, true);

  const fetched = await ctx.runFetch(url, { hops: [ctx.publicKeyURL], covers: 'named_url' });

  expect(fetched.outcome).toStrictEqual({
    status: 'error',
    message:
      'example.test redirected to a URL that holds a secret (rule github-pat), so it was not fetched',
  });

  expect(ctx.logged).toStrictEqual([
    { event: 'web_fetch.secret_refused', fields: { rule: 'github-pat', hop: 1 } },
  ]);
});

test('it fetches a typed URL that holds an own value and logs nothing', async () => {
  const ctx = await setupTest();

  const url = `https://example.test/docs?id=${ctx.ownValue}`;

  await ctx.writeMessage(`please read ${url} for me`, true);

  const fetched = await ctx.runFetch(url);

  expect(fetched.outcome).toMatchObject({ status: 'ok', result: { status: 200 } });
  expect(ctx.logged).toStrictEqual([]);
});

test('it fetches a clean typed URL that redirects to a URL with an own value, under redirects', async () => {
  const ctx = await setupTest();

  const url = 'https://example.test/docs';

  await ctx.writeMessage(`please read ${url} for me`, true);

  const fetched = await ctx.runFetch(url, {
    hops: [`https://www.example.test/docs?id=${ctx.ownValue}`],
    covers: 'redirects',
  });

  expect(fetched.outcome).toMatchObject({ status: 'ok', result: { status: 200 } });
});

test('it refuses a clean typed URL that redirects to a URL with an own value, under named_url', async () => {
  const ctx = await setupTest();

  const url = 'https://example.test/docs';

  await ctx.writeMessage(`please read ${url} for me`, true);

  const fetched = await ctx.runFetch(url, {
    hops: [`https://www.example.test/docs?id=${ctx.ownValue}`],
    covers: 'named_url',
  });

  expect(fetched.outcome).toStrictEqual({
    status: 'error',
    message:
      'example.test redirected to a URL that holds a secret (rule nixie-secret), so it was not fetched',
  });

  expect(ctx.logged).toStrictEqual([
    { event: 'web_fetch.secret_refused', fields: { rule: 'nixie-secret', hop: 1 } },
  ]);
});
