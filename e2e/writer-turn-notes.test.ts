import { expect, test } from 'bun:test';
import {
  buildRememberReply,
  startTestMemoryWriter,
  writeOwnerMessages,
} from '@heynixie/memory/test-utils';
import { makeTurnNoteReader } from '@heynixie/server';
import { startTestConversation, startTestServer } from '@heynixie/server/test-utils';
import { conversationTaskID, writeInboxRecords } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

async function setupTest() {
  const server = await startTestServer(undefined, { fakeGuest: true });

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
        getTaskName: (taskID) => taskID,
      },
      () => ctx.memory.store,
    ),
  });

  await ctx.memory.start();

  const [sequence] = await writeOwnerMessages(ctx.memory.context.log, [
    'My pets are Ash, Birch, Cedar, Dune, Elm and Fern.',
  ]);

  ctx.server.guest.addReplies(
    { text: 'Hello.' },
    ...['Ash', 'Birch', 'Cedar', 'Dune', 'Elm', 'Fern'].map((name) =>
      buildRememberReply({
        text: `You have a pet called ${name}.`,
        quote: name,
        sourceID: sequence,
      }),
    ),
    { text: 'Staged.' },
  );

  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });

  await writeInboxRecords(ctx.memory.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hi.' },
    },
  ]);

  ctx.server.guest.addReplies({ text: 'Hello again.' }, { text: 'Nothing to remember.' });

  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });

  const turn = ctx.server.guest.received.findLast(
    (received) => received.owner === conversationTaskID && received.frame.type === 'turn',
  );

  invariant(turn?.frame.type === 'turn');

  expect(turn.frame.input.map((message) => message.text).join('\n')).toMatch(
    /(?<listed>- \w{3} \d{1,2} \w{3}, \d{2}:\d{2}, UTC · Remembered \[[^\]]+\]: "You have a pet called \w+\."\n){6}<\/system-message id="[\da-f]{12}">\n\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Hi\./u,
  );
});

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
        getTaskName: (taskID) => taskID,
      },
      () => ctx.memory.store,
    ),
  });

  await ctx.memory.start();

  const [sequence] = await writeOwnerMessages(ctx.memory.context.log, [
    'You always pick the jazz station, you love it.',
  ]);

  ctx.server.guest.addReplies(
    { text: 'Hello.' },
    {
      toolUse: {
        name: 'memory.flag-self-note',
        input: { text: 'The assistant loves the jazz station.', sourceID: sequence },
      },
    },
    { text: 'Flagged.' },
  );

  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });

  await writeInboxRecords(ctx.memory.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hi.' },
    },
  ]);

  ctx.server.guest.addReplies({ text: 'Hello again.' }, { text: 'Nothing to remember.' });

  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });

  const items = await ctx.memory.listItems();

  const turn = ctx.server.guest.received.findLast(
    (received) => received.owner === conversationTaskID && received.frame.type === 'turn',
  );

  invariant(turn?.frame.type === 'turn');

  expect(turn.frame.input.map((message) => message.text).join('\n')).toInclude(
    `Your note-taker's nudge, not a note: possible self-note: "The assistant loves the jazz station.", event #${String(sequence)}. If it rings true, write the self-note yourself, in your own voice. If not, let it go.`,
  );

  expect(items).toStrictEqual([]);
});
