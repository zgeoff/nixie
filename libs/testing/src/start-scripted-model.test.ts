import { expect, onTestFinished, test } from 'bun:test';
import { startScriptedModel } from './start-scripted-model';
import { waitForCondition } from './wait-for-condition';

function setupTest() {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  return { model };
}

test('it answers each request with the next scripted reply', async () => {
  const ctx = setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'a' } } },
    { text: 'done' },
  );

  const sendRequest = async () => {
    const response = await fetch(`${ctx.model.url}/v1/messages`, {
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

test('it reports the input tokens a scripted reply sets, and 10 for one that sets none', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({ text: 'large', inputTokens: 150_000 }, { text: 'small' });

  const sendRequest = async () => {
    const response = await fetch(`${ctx.model.url}/v1/messages`, {
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

  ctx.model.addReplies({ text: 'large', inputTokens: 150_000 });

  const response = await fetch(`${ctx.model.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', stream: true, messages: [] }),
  });

  const text = await response.text();

  expect(text).toInclude('"usage":{"input_tokens":150000,"output_tokens":1}');
});

test('it reports the whole usage a scripted reply sets, cache writes included', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({
    text: 'cached',
    usage: {
      input_tokens: 40,
      output_tokens: 12,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 800,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    },
  });

  const response = await fetch(`${ctx.model.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  const body: unknown = await response.json();

  expect(body).toMatchObject({
    usage: {
      input_tokens: 40,
      output_tokens: 12,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 800,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    },
  });
});

test('it streams a scripted usage with the input side in its message start and the output in its last delta', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({
    text: 'cached',
    usage: {
      input_tokens: 40,
      output_tokens: 12,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2000 },
    },
  });

  const response = await fetch(`${ctx.model.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', stream: true, messages: [] }),
  });

  const text = await response.text();

  expect(text).toInclude(
    '"usage":{"input_tokens":40,"output_tokens":1,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2000}}',
  );

  expect(text).toInclude('"usage":{"output_tokens":12}');
});

test('it streams a reply as server-sent events when the request asks', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({ text: 'streamed' });

  const response = await fetch(`${ctx.model.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', stream: true, messages: [] }),
  });

  const text = await response.text();

  expect(response.headers.get('content-type')).toBe('text/event-stream');
  expect(text).toInclude('"text_delta","text":"streamed"');
  expect(text).toEndWith('event: message_stop\ndata: {"type":"message_stop"}\n\n');
});

test('it refuses a request past the end of its script with a 400', async () => {
  const ctx = setupTest();

  const response = await fetch(`${ctx.model.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  expect(response.status).toBe(400);
});

test('it answers a scripted refusal with a 400 that carries the API error message', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({ refusal: 'prompt is too long: 210000 tokens > 200000 maximum' });

  const response = await fetch(`${ctx.model.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  const body: unknown = await response.json();

  expect(response.status).toBe(400);

  expect(body).toStrictEqual({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message: 'prompt is too long: 210000 tokens > 200000 maximum',
    },
  });
});

test('it answers a scripted credential failure with a 401 the CLI does not retry', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({ authFailure: 'invalid x-api-key' });

  const response = await fetch(`${ctx.model.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  const body: unknown = await response.json();

  expect(response.status).toBe(401);
  expect(response.headers.get('x-should-retry')).toBe('false');

  expect(body).toStrictEqual({
    type: 'error',
    error: { type: 'authentication_error', message: 'invalid x-api-key' },
  });
});

test('it records every request with its path, headers and body', async () => {
  const ctx = setupTest();

  ctx.model.addReplies({ text: 'ok' });

  await fetch(`${ctx.model.url}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': 'placeholder' },
    body: JSON.stringify({ model: 'model-a', messages: [{ role: 'user', content: 'hi' }] }),
  });

  expect(ctx.model.requests).toMatchObject([
    {
      path: '/v1/messages',
      headers: { 'x-api-key': 'placeholder' },
      body: { model: 'model-a', messages: [{ role: 'user', content: 'hi' }] },
    },
  ]);
});

test('it holds a gated reply until its gate resolves', async () => {
  const ctx = setupTest();
  const gate = Promise.withResolvers<void>();

  ctx.model.addReplies({ text: 'held', gate: gate.promise });

  const response = fetch(`${ctx.model.url}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-a', messages: [] }),
  });

  await waitForCondition(() => ctx.model.requests.length === 1);

  const statusBeforeGate = Bun.peek.status(response);

  gate.resolve();

  const answered = await response;

  expect(statusBeforeGate).toBe('pending');
  expect(answered.json()).resolves.toMatchObject({ content: [{ type: 'text', text: 'held' }] });
});
