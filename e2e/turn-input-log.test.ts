import { expect, test } from 'bun:test';
import { startTestModelGateway } from '@heynixie/model-gateway/test-utils';
import {
  createTestClient,
  runHostCommand,
  sendClientMessage,
  startSpawnedNixie,
} from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';

async function setupTest() {
  const nixie = await startSpawnedNixie({
    routeModel: async (upstreamURL) => {
      const gateway = await startTestModelGateway(upstreamURL);

      return {
        baseURL: gateway.baseURL,
        config: [
          'turn_input_log:',
          '  default: always',
          '  close_wait: 2s',
          '  sources:',
          '    gateway:',
          `      base_url: ${gateway.url}`,
          `      dir: ${gateway.spoolDir}`,
        ],
      };
    },
  });

  return { nixie };
}

test('it lists a logged request, opens the bytes the model received, and removes them when the message is forgotten', async () => {
  const ctx = await setupTest();

  const server = ctx.nixie.harness.start();

  const api = await createTestClient(server);

  ctx.nixie.model.addReplies({ text: 'Plum-reply-4QX2' });

  const records = await sendClientMessage(
    api.client,
    { text: 'Quince-message-7LK9' },
    'Plum-reply-4QX2',
    { timeoutMs: 30_000 },
  );

  const sent = records.find((record) => record.message?.text === 'Quince-message-7LK9');

  invariant(sent);

  const listedRun = await runHostCommand(ctx.nixie.configPath, ['turn-input', 'list']);

  const inputSchema = z.object({ inputID: z.string(), state: z.string() });
  const listedSchema = z.object({ inputs: z.array(inputSchema) });
  const listed = listedSchema.parse(JSON.parse(listedRun.stdout));
  const [input] = listed.inputs;

  invariant(input);

  const opened = await runHostCommand(ctx.nixie.configPath, ['turn-input', 'open', input.inputID]);

  const received = ctx.nixie.model.requests.find((request) => request.path === '/v1/messages');

  await api.client.conversation.forget({
    clientActionID: crypto.randomUUID(),
    sequence: sent.sequence,
    thread: 'conversation',
  });

  const reopened = await runHostCommand(ctx.nixie.configPath, [
    'turn-input',
    'open',
    input.inputID,
  ]);

  expect({ count: listed.inputs.length, state: input.state }).toStrictEqual({
    count: 1,
    state: 'stored',
  });

  expect(JSON.parse(opened.stdout)).toStrictEqual(received?.body);
  expect(opened.stdout).toInclude('Quince-message-7LK9');
  expect(reopened.exitCode).toBe(1);
});
