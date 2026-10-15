import { expect, onTestFinished, test } from 'bun:test';
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
