import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';

async function setupTest(extraConfig: readonly string[] = []) {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    extraConfig,
    beforeStart: async (files) => {
      const definitions = join(dirname(files.configPath), 'definitions');

      await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
      await mkdir(join(definitions, 'rules'));

      await writeFile(
        join(definitions, 'rules', 'start.yaml'),
        'allow-tools:\n  outcome: allow\n  tools: [time.now, log.forget]\n',
      );
    },
  });

  await nixie.waitForLogEvent('ready');

  const api = await createTestClient(nixie);

  nixie.guest.addReplies({ toolUse: { name: 'time.now', input: {} } }, { text: 'Noted.' });

  await sendClientMessage(api.client, { text: 'The shed key sits under the blue pot.' }, 'Noted.');

  const read = await api.client.conversation.read({ thread: 'conversation' });

  const message = read.records.find((record) => record.kind === 'owner_message');
  const result = read.records.find((record) => record.kind === 'tool_result');

  invariant(message && result, 'the thread holds the message and the tool result');

  const forget = (sequence: number) =>
    api.client.conversation.forget({
      clientActionID: crypto.randomUUID(),
      thread: 'conversation',
      sequence,
    });

  // sends one more message and answers the events that its turn opens with
  const readNextTurn = async () => {
    nixie.guest.addReplies({ text: 'Back again.' });

    await sendClientMessage(api.client, { text: 'And again' }, 'Back again.');

    const turn = nixie.guest.turns.at(-1);

    invariant(turn, 'the next turn started');

    return turn.input.map((entry) => entry.text).join('\n');
  };

  return { nixie, api, message: message.sequence, result: result.sequence, forget, readNextTurn };
}

test("it lists the owner's forget of a message in the next turn's events by the message sequence", async () => {
  const ctx = await setupTest();

  await ctx.forget(ctx.message);

  const turn = await ctx.readNextTurn();

  expect(turn).toInclude(`the owner forgot message ${String(ctx.message)}`);
  expect(turn).not.toInclude('blue pot');
});

test("it adds no message line to the next turn's events for a forget of a tool result", async () => {
  const ctx = await setupTest();

  await ctx.forget(ctx.result);

  const turn = await ctx.readNextTurn();

  expect(turn).not.toInclude('forgot message');
});

test("it adds no line to the next turn's events when the message notice is off", async () => {
  const ctx = await setupTest(['forget_notices:', '  message: false']);

  await ctx.forget(ctx.message);

  const turn = await ctx.readNextTurn();

  expect(turn).not.toInclude('forgot message');
});

test("it adds no line to the next turn's events for a message that the assistant forgot", async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'log.forget', input: { record: String(ctx.message) } } },
    { text: 'Removed it.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Forget my first message.' }, 'Removed it.');

  const turn = await ctx.readNextTurn();

  expect(turn).not.toInclude('forgot message');
});
