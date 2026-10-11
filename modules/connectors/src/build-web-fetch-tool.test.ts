import { expect, mock, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import { buildWebFetchTool } from './build-web-fetch-tool';

test('it returns the page as the typed result, which the registry checks against the output schema', async () => {
  const readPage = mock(() =>
    Promise.resolve({
      kind: 'page' as const,
      url: 'https://example.com/',
      status: 200,
      contentType: 'text/html',
      text: 'Example Domain',
      isTruncated: false,
    }),
  );
  const registered = buildToolRegistry([buildWebFetchTool(readPage)]).findTool('web_fetch');

  const outcome = await registered?.definition.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://example.com/' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://example.com/',
      status: 200,
      contentType: 'text/html',
      text: 'Example Domain',
      isTruncated: false,
    },
  });
  expect(readPage).toHaveBeenCalledExactlyOnceWith('https://example.com/');
  if (outcome?.status !== 'ok') {
    throw new Error('the call returned no result');
  }
  expect(registered?.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});

test('it returns a binary page with no text', async () => {
  const tool = buildWebFetchTool(() =>
    Promise.resolve({
      kind: 'page',
      url: 'https://example.com/a.png',
      status: 200,
      contentType: 'image/png',
      text: null,
      isTruncated: false,
    }),
  );

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://example.com/a.png' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toMatchObject({ status: 'ok', result: { text: null } });
});

test.each([
  ['refused', 'only https URLs are fetched, not http:'],
  ['failed', 'the fetch passed 15000 ms'],
] as const)('it returns a %s fetch as an error with its reason', async (kind, reason) => {
  const tool = buildWebFetchTool(() => Promise.resolve({ kind, reason }));

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'web_fetch', input: { url: 'http://example.com/' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toStrictEqual({ status: 'error', message: reason });
});

test('it declares only the fetch effect and no destination, so it runs direct', () => {
  const tool = buildWebFetchTool(() => Promise.resolve({ kind: 'failed', reason: 'unused' }));

  expect(tool.execution).toBe('direct');
  expect(tool.declaration).toMatchObject({
    effects: ['fetch'],
    destinations: [],
    amount: null,
    content: [],
  });
});

test('it marks every result field as outside content', () => {
  const tool = buildWebFetchTool(() => Promise.resolve({ kind: 'failed', reason: 'unused' }));

  expect(tool.declaration.results).toStrictEqual({
    url: 'untrusted',
    status: 'untrusted',
    contentType: 'untrusted',
    text: 'untrusted',
    isTruncated: 'untrusted',
  });
});

test('it endorses only the status code and the truncated mark', () => {
  const tool = buildWebFetchTool(() => Promise.resolve({ kind: 'failed', reason: 'unused' }));
  expect(tool.output['properties']).toStrictEqual({
    url: { type: 'string' },
    status: { type: 'integer', 'x-endorsed': true },
    contentType: { type: ['string', 'null'] },
    text: { type: ['string', 'null'] },
    isTruncated: { type: 'boolean', 'x-endorsed': true },
  });
});

test('it is a tool the registry accepts', () => {
  const tool = buildWebFetchTool(() => Promise.resolve({ kind: 'failed', reason: 'unused' }));

  expect(() => buildToolRegistry([tool])).not.toThrow();
});
