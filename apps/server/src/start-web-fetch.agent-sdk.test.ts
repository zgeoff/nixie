import { expect, test } from 'bun:test';
import { startSpawnedNixie } from './test-utils/start-spawned-nixie';

test('it shows the model a fetched image as image content in the tool result, through the conversation guest', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  await server.ready;

  await nixie.waitForQueueCheck();

  nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__web_fetch',
        input: { url: 'https://tide-charts.test/images/40x30.png' },
      },
    },
    { text: 'The chart shows the harbour at low tide.' },
  );

  void server.request('sendMessage', {
    thread: 'conversation',
    text: 'What does https://tide-charts.test/images/40x30.png show?',
  });

  await nixie.waitForModelCalls(2);

  const [, afterFetch] = nixie.model.requests.filter((request) => request.path === '/v1/messages');
  const toolResults = JSON.stringify(afterFetch?.body?.messages);

  expect(toolResults).toInclude(
    '"type":"image","source":{"type":"base64","media_type":"image/png","data":"',
  );

  expect(toolResults).toInclude(
    String.raw`\"image\":{\"mediaType\":\"image/png\",\"width\":40,\"height\":30}`,
  );
});
