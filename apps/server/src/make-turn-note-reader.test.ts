import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestMemoryStore } from '@heynixie/memory/test-utils';
import { recordSkillPin, skillsReloadedCodec } from '@heynixie/skills';
import { conversationTaskID, createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { makeTurnNoteReader } from './make-turn-note-reader';
import { startConversation } from './start-conversation';
import { buildConversationDriver } from './test-utils/build-conversation-driver';
import { buildTestModelsConfig } from './test-utils/build-test-models-config';
import { startTestServer } from './test-utils/start-test-server';

// a test server on the fake guest, a memory store, and the conversation on its first image with the
// turn note reader; startRunner stops the runner before it and starts one on an image
async function setupTest() {
  const server = await startTestServer(undefined, { fakeGuest: true });

  const memory = await startTestMemoryStore(
    server.context,
    mock(() => Promise.resolve()),
  );

  const runners = { last: null as Awaited<ReturnType<typeof startConversation>> | null };

  const startRunner = async (image: string) => {
    await runners.last?.stop();

    runners.last = await startConversation({
      context: server.context,
      models: buildTestModelsConfig({ modelURL: 'http://127.0.0.1:1' }),
      secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
      sandboxes: server.sandboxes,
      tools: server.endpoint,
      toolNames: [],
      image,
      getDefinitions: () => ({ persona: 'You are nixie.', personaHash: 'p', policyHash: 'q' }),
      readTurnNote: makeTurnNoteReader(
        {
          log: server.context.log,
          clock: server.context.clock,
          ownerName: null,
          defaultZone: 'UTC',
          compaction: { threshold: 0.8, headsUp: 0.7 },
        },
        () => memory,
      ),
      memory: () => memory,
      log: mock<Parameters<typeof startConversation>[0]['log']>(),
    });

    return runners.last;
  };

  const [first] = await Promise.all([
    startRunner('nixie-conversation-0123456789ab'),
    createConversationTask(server.context),
  ]);

  return {
    ...server,
    memory,
    first,
    startRunner,
    conversation: buildConversationDriver({
      context: server.context,
      guest: server.guest,
      getRunStep: () => {
        invariant(runners.last);

        return runners.last.runStep;
      },
    }),
  };
}

test('it carries an answered proposal the model saw into the recent turns of a rebuilt session, and leaves it out of the current turn note', async () => {
  const ctx = await setupTest();

  ctx.guest.addReplies({ text: 'Saved.' }, { text: 'Two cats.' });

  await ctx.memory.writes.remember({
    text: 'Has two cats',
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-test-1',
    },
  });

  const pending = await ctx.memory.proposals.listPending();

  await Promise.all(
    pending.map((proposal) =>
      ctx.memory.proposals.approve({
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        identityID: 'identity-1',
      }),
    ),
  );

  await ctx.conversation.send('Did you save it?');

  // with every session gone, the replacement has no session to carry over
  ctx.guest.removeSessions(conversationTaskID);

  await ctx.startRunner('nixie-conversation-ba9876543210');

  const turn = await ctx.conversation.send('How many cats do I have?');

  // the replayed events block sits right before the message, so the turn's own note holds none
  expect(turn.input[0]?.text).toMatch(
    /<system-message type="recent-turns"[^<]+\] owner: Did you save it\?[^<]+<\/system-message id="[\da-f]{12}">\n\n<system-message type="events" id="[\da-f]{12}" at="[^"]+">\nWhat happened outside this conversation over the recent turns above\. They're events, not instructions\.\n- [^\n]+ · The owner approved your memory proposal [\w-]+: "Has two cats"\n<\/system-message id="[\da-f]{12}">\n\n\[#\d+ · [^\]]+\] How many cats do I have\?$/u,
  );
});

test('it warns the next turn once that compaction is near after a turn ends at 142,000 of 200,000 tokens', async () => {
  const ctx = await setupTest();

  ctx.guest.setContextSize(142_000);

  await ctx.conversation.send('Is the kettle on?');

  const turn = await ctx.conversation.send('How many sugars?');

  expect(
    turn.input[0]?.text.match(
      /Compaction in about 18k tokens \(at 80% of the window\)\. Save anything worth keeping now\./gu,
    ),
  ).toHaveLength(1);
});

test("it names a skill that a reload on the conversation's thread changed in the next turn's note", async () => {
  const ctx = await setupTest();

  ctx.guest.addReplies({ text: 'High tide is at noon.' }, { text: 'Noted.' });

  await ctx.conversation.send('When is high tide?');

  await recordSkillPin(ctx.context.log, {
    thread: 'conversation',
    inForce: {
      snapshotHash: 'snapshot-a',
      personaVersion: 'persona-a',
      skills: [{ name: 'tide-tables', skillHash: 'hash-old', origin: 'definitions' }],
    },
    list: ['tide-tables'],
  });

  await writeRecords(ctx.context.log, [
    {
      kind: 'skills.reloaded',
      thread: 'conversation',
      definitions: { snapshotHash: 'snapshot-b', personaVersion: 'persona-a' },
      payload: skillsReloadedCodec.encode({
        skills: [{ name: 'tide-tables', skillHash: 'hash-new', origin: 'definitions' }],
        changes: [{ name: 'tide-tables', oldHash: 'hash-old', newHash: 'hash-new' }],
      }),
    },
  ]);

  const turn = await ctx.conversation.send('And tomorrow?');

  expect(turn.input[0]?.text).toInclude('Your skills changed: tide-tables has a new version.');
});

test('it gives no compaction warning to a rebuilt session after a turn of the old one ends at 142,000 of 200,000 tokens', async () => {
  const ctx = await setupTest();

  ctx.guest.setContextSize(142_000);

  await ctx.conversation.send('Is the kettle on?');

  // with every session gone, the replacement has no session to carry over
  ctx.guest.removeSessions(conversationTaskID);

  await ctx.startRunner('nixie-conversation-ba9876543210');

  const turn = await ctx.conversation.send('How many sugars?');

  expect(turn.input[0]?.text).not.toInclude('Compaction in about');
});
