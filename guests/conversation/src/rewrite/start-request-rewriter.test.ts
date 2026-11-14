import { expect, onTestFinished, test } from 'bun:test';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { startStubModel } from '../test-utils/start-stub-model';
import { startRequestRewriter } from './start-request-rewriter';

function setupTest(providerPin: string | null = null) {
  const model = startStubModel({ pathPrefix: '/route-1' });

  onTestFinished(() => model.stop());

  const frame = buildMockTurnFrame({
    profile: {
      baseURL: `${model.url}/route-1/`,
      model: 'glm-test-1',
      requestRewrite: { providerPin },
    },
    systemPrompt: 'You are nixie.',
  });

  const rewriter = startRequestRewriter(frame);

  invariant(rewriter, 'the frame asks for a rewriter');
  onTestFinished(() => rewriter.stop());

  return {
    model,
    rewriter,
    frame,
    post: (path: string, body: unknown) =>
      fetch(`${rewriter.url}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-header': 'kept' },
        body: JSON.stringify(body),
      }),
  };
}

test('it starts no listener for a frame with no request rewrite', () => {
  const rewriter = startRequestRewriter(buildMockTurnFrame({ profile: { requestRewrite: null } }));

  expect(rewriter).toBeNull();
});

test('it sends a rewritten messages request to the whole base URL, with the CLI headers', async () => {
  const ctx = setupTest('z-ai');
  const kept = { type: 'text', text: 'You are nixie.', cache_control: { type: 'ephemeral' } };

  ctx.model.addReplies({ text: 'hello' });

  const response = await ctx.post('/v1/messages?beta=true', {
    model: 'glm-test-1',
    stream: false,
    system: [{ type: 'text', text: 'You are a CLI agent.' }, kept],
    messages: [],
  });

  expect(response.status).toBe(200);

  expect(ctx.model.requests).toStrictEqual([
    {
      path: '/route-1/v1/messages',
      headers: expect.objectContaining({ 'x-test-header': 'kept' }),
      body: {
        model: 'glm-test-1',
        stream: false,
        system: [kept],
        messages: [],
        provider: { order: ['z-ai'], allow_fallbacks: false },
      },
    },
  ]);
});

test('it relays the upstream body of a messages request as it came', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({ text: 'hello' });

  const response = await ctx.post('/v1/messages', {
    model: 'glm-test-1',
    stream: false,
    system: [{ type: 'text', text: 'You are nixie.' }],
    messages: [],
  });

  const message = await response.json();

  expect(message).toMatchObject({ type: 'message', content: [{ type: 'text', text: 'hello' }] });
});

test('it relays a streamed response', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({ text: 'hello' });

  const response = await ctx.post('/v1/messages', {
    model: 'glm-test-1',
    stream: true,
    system: [{ type: 'text', text: 'You are nixie.' }],
    messages: [],
  });

  const text = await response.text();

  expect(response.headers.get('content-type')).toBe('text/event-stream');
  expect(text).toInclude('event: message_stop');
});

test('it sends a token count with no provider order', async () => {
  const ctx = setupTest('z-ai');
  const kept = { type: 'text', text: 'You are nixie.' };

  const response = await ctx.post('/v1/messages/count_tokens', {
    model: 'glm-test-1',
    system: [{ type: 'text', text: 'You are a CLI agent.' }, kept],
    messages: [],
  });

  const count = await response.json();

  expect(count).toStrictEqual({ input_tokens: 10 });

  expect(ctx.model.requests.map((request) => request.body)).toStrictEqual([
    { model: 'glm-test-1', system: [kept], messages: [] },
  ]);
});

test('it passes a failed upstream response on as it came', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({
    apiError: { status: 529, type: 'overloaded_error', message: 'the model is busy' },
  });

  const response = await ctx.post('/v1/messages', {
    model: 'glm-test-1',
    stream: false,
    system: [{ type: 'text', text: 'You are nixie.' }],
    messages: [],
  });

  const error = await response.json();

  expect(response.status).toBe(529);

  expect(error).toStrictEqual({
    type: 'error',
    error: { type: 'overloaded_error', message: 'the model is busy' },
  });
});

test('it passes a GET of the model list on as it came', async () => {
  const ctx = setupTest();

  await fetch(`${ctx.rewriter.url}/v1/models`, { headers: { 'x-test-header': 'kept' } });

  expect(ctx.model.requests).toStrictEqual([
    {
      path: '/route-1/v1/models',
      headers: expect.objectContaining({ 'x-test-header': 'kept' }),
      body: null,
    },
  ]);
});

test('it answers a refused request with a 400 in the Messages error shape and sends nothing upstream', async () => {
  const ctx = setupTest();

  const response = await ctx.post('/v1/messages', {
    model: 'glm-test-1',
    system: [{ type: 'text', text: 'You are a CLI agent.' }],
    messages: [],
  });

  const message =
    "nixie refused a model request to glm-test-1: no tail of its 1 system blocks equals nixie's system prompt, so nixie cannot show that the CLI's blocks are gone";

  const error = await response.json();
  const refused = await ctx.rewriter.refused;

  expect(response.status).toBe(400);

  expect(error).toStrictEqual({
    type: 'error',
    error: { type: 'invalid_request_error', message },
  });

  expect(ctx.model.requests).toStrictEqual([]);
  expect(refused.message).toBe(message);
});

test('it refuses a request that is not a messages request or a token count', async () => {
  const ctx = setupTest();

  const response = await ctx.post('/v1/complete', {});
  const refused = await ctx.rewriter.refused;

  expect(response.status).toBe(400);

  expect(refused.message).toBe(
    'nixie refused a model request to glm-test-1: it can show the removal only on messages and token counts, so it refuses POST /v1/complete',
  );

  expect(ctx.model.requests).toStrictEqual([]);
});

test('it refuses every request after its first refusal, with the first refusal', async () => {
  const ctx = setupTest();

  await ctx.post('/v1/messages', { system: [{ type: 'text', text: 'You are a CLI agent.' }] });

  const second = await ctx.post('/v1/messages', {
    system: [{ type: 'text', text: 'You are nixie.' }],
  });

  const refused = await ctx.rewriter.refused;
  const error = await second.json();

  expect(second.status).toBe(400);
  expect(error).toMatchObject({ error: { message: refused.message } });
  expect(ctx.model.requests).toStrictEqual([]);
});

test('it throws when the listener cannot bind', () => {
  const ctx = setupTest();
  const port = Number(new URL(ctx.rewriter.url).port);

  expect(() => startRequestRewriter(ctx.frame, { port })).toThrow();
});
