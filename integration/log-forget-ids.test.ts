import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';

async function setupTest() {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const definitions = join(dirname(files.configPath), 'definitions');

      await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
      await mkdir(join(definitions, 'rules'));

      await writeFile(
        join(definitions, 'rules', 'start.yaml'),
        'allow-reads:\n  outcome: allow\n  tools: [time.now, log.read]\n' +
          'ask-log-forget:\n  outcome: ask\n  tools: [log.forget]\n',
      );
    },
  });

  await nixie.waitForLogEvent('ready');

  const api = await createTestClient(nixie);

  nixie.guest.addReplies({ toolUse: { name: 'time.now', input: {} } }, { text: 'Hi there.' });

  const sent = await sendClientMessage(api.client, { text: 'Hello there' }, 'Hi there.');

  const first = sent.find((record) => record.kind === 'owner_message');

  invariant(first, 'the message is in the thread');

  return { nixie, api, first: first.sequence };
}

test('it takes the ID that an owner message, a reply and a log.read entry show as a record to remove', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<void>();

  // The removal of an earlier record rebuilds the session, which opens with the earlier replies as
  // history lines.
  await ctx.api.client.conversation.forget({
    clientActionID: crypto.randomUUID(),
    thread: 'conversation',
    sequence: ctx.first,
  });

  ctx.nixie.guest.addReplies({ text: 'Back again.', gate: () => gate.promise });

  await ctx.api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'And again',
    thread: 'conversation',
  });

  await waitForCondition(() => ctx.nixie.guest.turns.length >= 2);

  const received = ctx.nixie.guest.received.at(-1);
  const turn = ctx.nixie.guest.turns.at(-1);

  invariant(received && turn, 'the turn started on a rebuilt session');

  const texts = turn.input.map((message) => message.text).join('\n');

  const read = await ctx.nixie.callTool(received, 'log.read', {});

  const entrySchema = z.object({ eventID: z.string(), callEventID: z.string().optional() });
  const readSchema = z.object({ structuredContent: z.object({ entries: z.array(entrySchema) }) });
  const parsed: unknown = JSON.parse(read);
  const entries = readSchema.parse(parsed).structuredContent.entries;
  const stamps = texts.matchAll(/<owner-message id="(?<id>\d+)"/gu);
  const lines = texts.matchAll(/\[#(?<id>\d+) · [^\]]*\] nixie:/gu);

  const ids = {
    stamp: Array.from(stamps, (match) => match.groups?.['id'] ?? ''),
    history: Array.from(lines, (match) => match.groups?.['id'] ?? ''),
    eventID: entries.map((entry) => entry.eventID),
    callEventID: entries.flatMap((entry) =>
      entry.callEventID === undefined ? [] : [entry.callEventID],
    ),
  };

  const answers = await Promise.all(
    Object.values(ids)
      .flat()
      .map((record) => ctx.nixie.callTool(received, 'log.forget', { record })),
  );

  gate.resolve();

  expect(answers.filter((answer) => !answer.includes('Waiting for approval'))).toStrictEqual([]);

  expect(Object.entries(ids).map(([name, found]) => [name, found.length > 0])).toStrictEqual([
    ['stamp', true],
    ['history', true],
    ['eventID', true],
    ['callEventID', true],
  ]);
});
