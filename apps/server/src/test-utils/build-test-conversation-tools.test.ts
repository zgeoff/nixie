import { expect, test } from 'bun:test';
import { startTestMemoryStore } from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { buildTestConversationTools } from './build-test-conversation-tools';
import { startTestServer } from './start-test-server';

async function setupTest() {
  return { server: await startTestServer() };
}

test('it returns the reply given from every web fetch', async () => {
  const ctx = await setupTest();

  const tools = buildTestConversationTools({
    kind: 'page',
    url: 'https://bread-notes.test/rye',
    status: 200,
    contentType: 'text/plain',
    text: 'Rye bread needs a long proof.',
    links: [],
    isTruncated: false,
    blocked: null,
  });

  const webFetch = tools
    .buildTools(ctx.server.context)
    .definitions.find((definition) => definition.name === 'web_fetch');

  invariant(webFetch);

  const outcome = await webFetch.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://other-site.test/' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://bread-notes.test/rye',
      status: 200,
      contentType: 'text/plain',
      text: 'Rye bread needs a long proof.',
      isTruncated: false,
      blocked: null,
    },
  });
});

test('it lets a web fetch through the decision point', async () => {
  const ctx = await setupTest();

  const tools = buildTestConversationTools({ kind: 'failed', reason: 'no page' });

  const outcome = tools
    .buildTools(ctx.server.context)
    .decide({ tool: 'web_fetch', toolList: ['web_fetch'] });

  expect(outcome).toMatchObject({ decision: { outcome: 'allow' } });
});

test('it refuses a memory tool call before the store is set', async () => {
  const ctx = await setupTest();

  const tools = buildTestConversationTools({ kind: 'failed', reason: 'no page' });

  const remember = tools
    .buildTools(ctx.server.context)
    .definitions.find((definition) => definition.name === 'memory.remember');

  invariant(remember);

  expect(
    remember.run(
      {
        callID: 'call-1',
        tool: 'memory.remember',
        input: { text: 'Bakes rye bread on Sundays.' },
        toolUseID: null,
      },
      {
        run: {
          runID: 'run-1',
          thread: 'conversation',
          tools: ['memory.remember'],
          model: { model: 'claude-test-1', profile: 'chat-direct' },
        },
      },
    ),
  ).rejects.toThrowWithMessage(Error, 'a tool call ran before the memory store started');
});

test('it runs a memory tool call on the store set', async () => {
  const ctx = await setupTest();
  const store = await startTestMemoryStore(ctx.server.context, () => Promise.resolve());

  const tools = buildTestConversationTools({ kind: 'failed', reason: 'no page' });

  const remember = tools
    .buildTools(ctx.server.context)
    .definitions.find((definition) => definition.name === 'memory.remember');

  invariant(remember);

  tools.setStore(store);

  const outcome = await remember.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { text: 'Bakes rye bread on Sundays.' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['memory.remember'],
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toMatchObject({ status: 'ok', result: { status: 'proposed' } });
});
