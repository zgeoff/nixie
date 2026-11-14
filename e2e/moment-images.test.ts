import { expect, test } from 'bun:test';
import { createTestClient, startSpawnedNixie } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';

test('it opens a photo of a kept moment, found through moment.read, with log.read_image', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  nixie.model.addReplies({ text: 'Plum-reply-2KD7' });

  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  const sent = await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Plum-message-8XT3',
    thread: 'conversation',
    images: [new File([pngBytes], 'shelf.png', { type: 'image/png' })],
  });

  // The turn starts the real SDK in a guest process, which outlasts the default wait on a busy host.
  await waitForCondition(
    async () => {
      const page = await api.client.conversation.read({ thread: 'conversation' });

      return page.records.some(
        (record) => record.kind === 'model.reply' && record.message?.text === 'Plum-reply-2KD7',
      );
    },
    { timeoutMs: 30_000, intervalMs: 100 },
  );

  nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__moment_keep',
        input: {
          firstEventID: String(sent.sequence),
          lastEventID: String(sent.sequence),
          title: 'The shelf photo',
        },
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__moment_read',
        input: (body) => {
          const seen = JSON.stringify(body.messages);

          const momentID = [...seen.matchAll(/momentID\\*":\\*"(?<id>[a-z0-9]+)/gu)].at(-1)
            ?.groups?.['id'];

          invariant(momentID, 'the request holds no momentID');

          return { momentID };
        },
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__log_read_image',
        input: (body) => {
          const seen = JSON.stringify(body.messages);
          const eventID = [...seen.matchAll(/eventID\\*":\\*"(?<id>\d+)/gu)].at(-1)?.groups?.['id'];
          const number = /images\\*":\[\{\\*"n\\*":(?<number>\d+)/u.exec(seen)?.groups?.['number'];

          invariant(eventID && number, 'the request holds no image pointer');

          return { eventID, number: Number(number) };
        },
      },
    },
    { text: 'Plum-reply-9QW4' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Look at the shelf photo again',
    thread: 'conversation',
  });

  await waitForCondition(
    async () => {
      const page = await api.client.conversation.read({ thread: 'conversation' });

      return page.records.some(
        (record) => record.kind === 'model.reply' && record.message?.text === 'Plum-reply-9QW4',
      );
    },
    { timeoutMs: 30_000, intervalMs: 100 },
  );

  const page = await api.client.conversation.read({ thread: 'conversation' });

  const called = page.records.find((record) => record.toolCall?.tool === 'log.read_image');

  const imageResult = page.records.find(
    (record) =>
      record.kind === 'tool_result' && record.toolCall?.callID === called?.toolCall?.callID,
  );

  expect(imageResult?.toolCall).toMatchObject({
    outcome: 'result',
    content: { result: { eventID: String(sent.sequence), number: 1, mediaType: 'image/png' } },
  });
});
