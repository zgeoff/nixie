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
