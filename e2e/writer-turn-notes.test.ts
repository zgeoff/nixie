import { expect, test } from 'bun:test';
import {
  buildRememberReply,
  startTestMemoryWriter,
  writeOwnerMessages,
} from '@heynixie/memory/test-utils';
import { makeTurnNoteReader } from '@heynixie/server';
import { startTestConversation, startTestServer } from '@heynixie/server/test-utils';
import { writeInboxRecords } from '@heynixie/tasks';

// The journey runs a writer batch over your message, then the conversation's next turn, whose note
// carries what the batch did.

// memory and its writer on a test server, which a test starts after it records the messages the
// catch-up covers
async function setupTest() {
  const server = await startTestServer();

  return { server, memory: await startTestMemoryWriter(server) };
}

test('it carries each item of a live batch as an events line on the next conversation turn', async () => {
  const ctx = await setupTest();

  const conversation = await startTestConversation(ctx.server, {
    context: ctx.memory.context,
    readTurnNote: makeTurnNoteReader(
      {
        log: ctx.memory.context.log,
        clock: ctx.memory.context.clock,
        ownerName: null,
        defaultZone: 'UTC',
        compaction: { threshold: 0.8, headsUp: 0.7 },
      },
      () => ctx.memory.store,
    ),
  });

  await ctx.memory.start();

  const [sequence] = await writeOwnerMessages(ctx.memory.context.log, [
    'My pets are Ash, Birch, Cedar, Dune, Elm and Fern.',
  ]);

  ctx.memory.model.addReplies(
    ...['Ash', 'Birch', 'Cedar', 'Dune', 'Elm', 'Fern'].map((name) =>
      buildRememberReply({
        text: `You have a pet called ${name}.`,
        quote: name,
        sourceID: sequence,
      }),
    ),
    { text: 'Staged.' },
    { text: 'Nothing to remember.' },
  );

  conversation.model.addReplies({ text: 'Hello.' });

  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });

  await writeInboxRecords(ctx.memory.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hi.' },
    },
  ]);

  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });

  expect(JSON.stringify(conversation.model.requests.at(-1)?.body?.messages)).toMatch(
    /(?<listed>- \w{3} \d{1,2} \w{3}, \d{2}:\d{2}, UTC · Remembered \[[^\]]+\]: \\"You have a pet called \w+\.\\"\\n){6}<\/system-message id=\\"[\da-f]{12}\\">\\n\\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Hi\./u,
  );
}, 60_000);

test('it carries a flagged self-note as an events line on the next turn, and files no item', async () => {
  const ctx = await setupTest();

  const conversation = await startTestConversation(ctx.server, {
    context: ctx.memory.context,
    readTurnNote: makeTurnNoteReader(
      {
        log: ctx.memory.context.log,
        clock: ctx.memory.context.clock,
        ownerName: null,
        defaultZone: 'UTC',
        compaction: { threshold: 0.8, headsUp: 0.7 },
      },
      () => ctx.memory.store,
    ),
  });

  await ctx.memory.start();

  const [sequence] = await writeOwnerMessages(ctx.memory.context.log, [
    'You always pick the jazz station, you love it.',
  ]);

  ctx.memory.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_flag-self-note',
        input: { text: 'The assistant loves the jazz station.', sourceID: sequence },
      },
    },
    { text: 'Flagged.' },
    { text: 'Nothing to remember.' },
  );

  conversation.model.addReplies({ text: 'Hello.' });

  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });

  await writeInboxRecords(ctx.memory.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hi.' },
    },
  ]);

  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });

  const items = await ctx.memory.listItems();

  expect(JSON.stringify(conversation.model.requests.at(-1)?.body?.messages)).toInclude(
    `Your note-taker's nudge, not a note: possible self-note: \\"The assistant loves the jazz station.\\", event #${String(sequence)}. If it rings true, write the self-note yourself, in your own voice. If not, let it go.`,
  );

  expect(items).toStrictEqual([]);
}, 60_000);
