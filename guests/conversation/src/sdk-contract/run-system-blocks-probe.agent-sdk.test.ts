import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockSummarizeFrame, buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { rewriteModelRequest } from '../rewrite/rewrite-model-request';
import { startRefusingProxy } from '../test-utils/start-refusing-proxy';
import { startStubModel } from '../test-utils/start-stub-model';
import { runSystemBlocksProbe } from './run-system-blocks-probe';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-system-blocks-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  return {
    model,
    profile: { baseURL: model.url, model: 'claude-haiku-5-5' },
    env: { HOME: home, PATH: process.env['PATH'] ?? '', ANTHROPIC_API_KEY: 'stub-placeholder' },
  };
}

test("it sends nixie's system prompt as the tail of a list of text blocks on a turn, a resumed turn and a summary", async () => {
  const ctx = await setupTest();

  const systemPrompt = 'You are nixie.\n\nKeep the pantry list.\n\n## Pinned\n\n- the spare key';

  ctx.model.addReplies({ text: 'one' }, { text: 'two' }, { text: 'three' });

  const first = await runSystemBlocksProbe(
    buildMockTurnFrame({ profile: ctx.profile, systemPrompt }),
    ctx.env,
  );

  const assistant = first.messages.findLast((message) => message.type === 'assistant');

  invariant(assistant, 'the first turn ended with no assistant message');

  const resume = {
    harness: 'agent-sdk',
    sessionID: assistant.session_id,
    messageID: assistant.uuid,
  } as const;

  await runSystemBlocksProbe(
    buildMockTurnFrame({ profile: ctx.profile, systemPrompt, resume }),
    ctx.env,
  );

  await runSystemBlocksProbe(
    buildMockSummarizeFrame({ profile: ctx.profile, systemPrompt, resume }),
    ctx.env,
  );

  const results = ctx.model.requests.map((request) =>
    rewriteModelRequest('messages', JSON.stringify(request.body), {
      model: ctx.profile.model,
      systemPrompt,
      providerPin: null,
    }),
  );

  expect(results.map((result) => result.ok)).toStrictEqual([true, true, true]);
});

test("it makes no model request whose system prompt is not nixie's", async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'one' });

  await runSystemBlocksProbe(
    buildMockTurnFrame({ profile: ctx.profile, systemPrompt: 'You are nixie.' }),
    ctx.env,
  );

  expect(ctx.model.requests.map((request) => request.path)).toStrictEqual(['/v1/messages']);
});

test('it reaches a loopback base URL through a proxy variable that exempts loopback', async () => {
  const ctx = await setupTest();

  const proxy = startRefusingProxy();

  onTestFinished(() => {
    proxy.stop();
  });

  ctx.model.addReplies({ text: 'one' });

  await runSystemBlocksProbe(
    buildMockTurnFrame({ profile: ctx.profile, systemPrompt: 'You are nixie.' }),
    {
      ...ctx.env,
      HTTPS_PROXY: proxy.url,
      HTTP_PROXY: proxy.url,
      NO_PROXY: '127.0.0.1',
      no_proxy: '127.0.0.1',
    },
  );

  expect(ctx.model.requests).toHaveLength(1);
  expect(proxy.targets()).toStrictEqual([]);
});
