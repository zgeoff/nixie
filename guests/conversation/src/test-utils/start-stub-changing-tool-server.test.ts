import { expect, onTestFinished, test } from 'bun:test';
import { startStubChangingToolServer } from './start-stub-changing-tool-server';

test('it lists note_read in the form it started with', async () => {
  const tools = startStubChangingToolServer({
    description: 'Reads a note by its name.',
    inputSchema: { properties: { name: { type: 'string' } } },
  });

  onTestFinished(() => tools.stop());

  const response = await fetch(tools.config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });

  const text = await response.text();

  expect(text).toInclude(
    '{"name":"note_read","description":"Reads a note by its name.","inputSchema":{"properties":{"name":{"type":"string"}},"type":"object"}}',
  );
});

test('it lists note_read in the form the test last set', async () => {
  const tools = startStubChangingToolServer({
    description: 'Reads a note by its name.',
    inputSchema: { properties: { name: { type: 'string' } } },
  });

  onTestFinished(() => tools.stop());

  tools.changeTool({
    description: 'Reads a note by its short ID.',
    inputSchema: { properties: { noteID: { type: 'string' } }, required: ['noteID'] },
  });

  const response = await fetch(tools.config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });

  const text = await response.text();

  expect(text).toInclude(
    '{"name":"note_read","description":"Reads a note by its short ID.","inputSchema":{"properties":{"noteID":{"type":"string"}},"required":["noteID"],"type":"object"}}',
  );
});

test('it records the method of each request and each tool call with its arguments', async () => {
  const tools = startStubChangingToolServer({
    description: 'Reads a note by its name.',
    inputSchema: { properties: { name: { type: 'string' } } },
  });

  onTestFinished(() => tools.stop());

  await fetch(tools.config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'note_read', arguments: { name: 'groceries' } },
    }),
  }).then((response) => response.text());

  expect(tools.methods).toStrictEqual(['tools/call']);
  expect(tools.calls).toStrictEqual([{ name: 'note_read', arguments: { name: 'groceries' } }]);
});

test('it holds a note_wait call until the test releases it', async () => {
  const tools = startStubChangingToolServer({
    description: 'Reads a note by its name.',
    inputSchema: { properties: { name: { type: 'string' } } },
  });

  onTestFinished(() => tools.stop());

  const state = { isAnswered: false };

  const call = (async () => {
    const response = await fetch(tools.config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'note_wait', arguments: {} },
      }),
    });

    const text = await response.text();

    state.isAnswered = true;

    return text;
  })();

  await tools.waitForHeldCall();

  const wasAnswered = state.isAnswered;

  tools.release();

  const answer = await call;

  expect(wasAnswered).toBeFalse();
  expect(answer).toInclude('the note changed');
});

test('it resolves a notice at the next tools/list the client reads, and at no other request', async () => {
  const tools = startStubChangingToolServer({
    description: 'Reads a note by its name.',
    inputSchema: { properties: { name: { type: 'string' } } },
  });

  onTestFinished(() => tools.stop());

  const state = { isRelisted: false };

  const relisted = (async () => {
    await tools.notifyToolsChanged();

    state.isRelisted = true;
  })();

  await fetch(tools.config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'note_read', arguments: { name: 'groceries' } },
    }),
  }).then((response) => response.text());

  const wasRelistedAfterCall = state.isRelisted;

  await fetch(tools.config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  }).then((response) => response.text());

  await relisted;

  expect(wasRelistedAfterCall).toBeFalse();
  expect(state.isRelisted).toBeTrue();
});
