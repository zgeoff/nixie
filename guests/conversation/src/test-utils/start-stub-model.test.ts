import { expect, onTestFinished, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startStubModel } from './start-stub-model';

function setupTest() {
  const stub = startStubModel();

  onTestFinished(() => stub.stop());

  return { stub };
}

test('it answers each request with the next scripted reply', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'a' } } },
    { text: 'done' },
  );

  const sendRequest = async () => {
    const response = await fetch(`${ctx.stub.url}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-a', messages: [] }),
    });

    return response.json();
  };

  const first = await sendRequest();
  const second = await sendRequest();

  expect(first).toMatchObject({
    model: 'model-a',
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'mcp__nixie__note_read', input: { name: 'a' } }],
  });

  expect(second).toMatchObject({
    model: 'model-a',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'done' }],
  });
});

test('it streams a reply as server-sent events when the request asks', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({ text: 'streamed' });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', stream: true, messages: [] }),
  });

  const text = await response.text();

  expect(response.headers.get('content-type')).toBe('text/event-stream');
  expect(text).toInclude('"text_delta","text":"streamed"');
  expect(text).toEndWith('event: message_stop\ndata: {"type":"message_stop"}\n\n');
});

test('it counts 10 tokens for any request when no rate is set', async () => {
  const ctx = setupTest();

  const response = await fetch(`${ctx.stub.url}/v1/messages/count_tokens`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [{ role: 'user', content: 'a long log' }] }),
  });

  const body = await response.json();

  expect(body).toStrictEqual({ input_tokens: 10 });
});

test('it counts the tokens of a request from the characters of its messages at the set rate', async () => {
  const ctx = setupTest();

  ctx.stub.setCharactersPerToken(2);

  const messages = [{ role: 'user', content: 'a log' }];

  const response = await fetch(`${ctx.stub.url}/v1/messages/count_tokens`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages }),
  });

  const body = await response.json();

  expect(JSON.stringify(messages)).toHaveLength(35);
  expect(body).toStrictEqual({ input_tokens: 18 });
});

test('it streams an endless reply up to its text and never ends the message', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({ text: 'still going', isEndless: true });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', stream: true, messages: [] }),
  });

  invariant(response.body !== null, 'the stub answered a streamed request with no body');

  const reader = response.body.getReader();

  onTestFinished(() => reader.cancel());

  const first = await reader.read();

  invariant(first.value instanceof Uint8Array, 'the stub ended the stream before its first chunk');

  const text = new TextDecoder().decode(first.value);

  expect(text).toInclude('"text_delta","text":"still going"');
  expect(text).not.toInclude('content_block_stop');
  expect(text).not.toInclude('message_stop');
});

test('it answers a reply that scripts thinking with a thinking block before the reply and the thinking tokens in its usage', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({
    text: 'done',
    thinking: { summary: 'I reason it through.', signature: 'sig-blob', thinkingTokens: 20 },
  });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  const body = await response.json();

  expect(body).toMatchObject({
    content: [
      { type: 'thinking', thinking: 'I reason it through.', signature: 'sig-blob' },
      { type: 'text', text: 'done' },
    ],
    usage: { output_tokens: 5, output_tokens_details: { thinking_tokens: 20 } },
  });
});

test('it streams a thinking block with its signature and the thinking tokens when a reply scripts thinking', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({
    text: 'done',
    thinking: { summary: 'I reason it through.', signature: 'sig-blob', thinkingTokens: 20 },
  });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', stream: true, messages: [] }),
  });

  const text = await response.text();

  expect(text).toInclude('"thinking_delta","thinking":"I reason it through."');
  expect(text).toInclude('"signature_delta","signature":"sig-blob"');
  expect(text).toInclude('"output_tokens_details":{"thinking_tokens":20}');
});

test('it reports the input tokens a scripted reply sets, and 10 for one that sets none', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({ text: 'large', inputTokens: 150_000 }, { text: 'small' });

  const sendRequest = async () => {
    const response = await fetch(`${ctx.stub.url}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-a', messages: [] }),
    });

    return response.json();
  };

  const first = await sendRequest();
  const second = await sendRequest();

  expect(first).toMatchObject({ usage: { input_tokens: 150_000 } });
  expect(second).toMatchObject({ usage: { input_tokens: 10 } });
});

test('it streams the input tokens a scripted reply sets in its message start', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({ text: 'large', inputTokens: 150_000 });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', stream: true, messages: [] }),
  });

  const text = await response.text();

  expect(text).toInclude('"usage":{"input_tokens":150000,"output_tokens":1}');
});

test('it reports the cache tokens a scripted reply sets beside its input tokens', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({
    text: 'cached',
    inputTokens: 300,
    cacheReadTokens: 38_000,
    cacheWriteTokens: 2700,
  });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  const body = await response.json();

  expect(body).toMatchObject({
    usage: {
      input_tokens: 300,
      cache_read_input_tokens: 38_000,
      cache_creation_input_tokens: 2700,
      output_tokens: 5,
    },
  });
});

test('it streams the cache tokens a scripted reply sets in its message start', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({
    text: 'cached',
    inputTokens: 300,
    cacheReadTokens: 38_000,
    cacheWriteTokens: 2700,
  });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', stream: true, messages: [] }),
  });

  const text = await response.text();

  expect(text).toInclude(
    '"usage":{"input_tokens":300,"cache_read_input_tokens":38000,"cache_creation_input_tokens":2700,"output_tokens":1}',
  );
});

test('it refuses a request past the end of its script with a 400', async () => {
  const ctx = setupTest();

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  expect(response.status).toBe(400);
});

test('it refuses a request with the scripted refusal and answers the next with its reply', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies(
    { refusal: 'prompt is too long: 210000 tokens > 200000 maximum' },
    { text: 'ok' },
  );

  const sendRequest = () =>
    fetch(`${ctx.stub.url}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-a', messages: [] }),
    });

  const refused = await sendRequest();
  const refusal = await refused.json();
  const answered = await sendRequest();
  const answer = await answered.json();

  expect(refused.status).toBe(400);

  expect(refusal).toStrictEqual({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message: 'prompt is too long: 210000 tokens > 200000 maximum',
    },
  });

  expect(answer).toMatchObject({ content: [{ type: 'text', text: 'ok' }] });
});

test('it refuses a request with the scripted credential failure as a 401 the CLI does not retry', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({ authFailure: 'invalid x-api-key' });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  const body = await response.json();

  expect(response.status).toBe(401);
  expect(response.headers.get('x-should-retry')).toBe('false');

  expect(body).toStrictEqual({
    type: 'error',
    error: { type: 'authentication_error', message: 'invalid x-api-key' },
  });
});

test('it refuses a request with the scripted API error, its wait and its retry header', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({
    apiError: {
      status: 429,
      type: 'rate_limit_error',
      message: 'Weekly allowance used up',
      retryAfterSeconds: 3600,
      shouldRetry: false,
    },
  });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  const body = await response.json();

  expect({
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
    shouldRetry: response.headers.get('x-should-retry'),
    body,
  }).toStrictEqual({
    status: 429,
    retryAfter: '3600',
    shouldRetry: 'false',
    body: {
      type: 'error',
      error: { type: 'rate_limit_error', message: 'Weekly allowance used up' },
    },
  });
});

test('it sends no wait and no retry header for an API error that scripts neither', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({
    apiError: { status: 500, type: 'api_error', message: 'Internal server error' },
  });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  expect({
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
    shouldRetry: response.headers.get('x-should-retry'),
  }).toStrictEqual({ status: 500, retryAfter: null, shouldRetry: null });
});

test('it refuses a request with the scripted missing resource as a 404', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({ notFound: 'model: model-gone' });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-gone', messages: [] }),
  });

  const body = await response.json();

  expect(response.status).toBe(404);

  expect(body).toStrictEqual({
    type: 'error',
    error: { type: 'not_found_error', message: 'model: model-gone' },
  });
});

test('it ends a reply that scripts the output cap with the max_tokens stop reason', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({ text: 'cut', isOutputCapped: true });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  const body = await response.json();

  expect(body).toMatchObject({ stop_reason: 'max_tokens' });
});

test('it streams the max_tokens stop reason for a reply that scripts the output cap', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({ text: 'cut', isOutputCapped: true });

  const response = await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', stream: true, messages: [] }),
  });

  const text = await response.text();

  expect(text).toInclude('"stop_reason":"max_tokens"');
});

test('it records every request with its path, headers and body', async () => {
  const ctx = setupTest();

  ctx.stub.addReplies({ text: 'ok' });

  await fetch(`${ctx.stub.url}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': 'placeholder' },
    body: JSON.stringify({ model: 'model-a', messages: [{ role: 'user', content: 'hi' }] }),
  });

  expect(ctx.stub.requests).toMatchObject([
    {
      path: '/v1/messages',
      headers: { 'x-api-key': 'placeholder' },
      body: { model: 'model-a', messages: [{ role: 'user', content: 'hi' }] },
    },
  ]);
});
