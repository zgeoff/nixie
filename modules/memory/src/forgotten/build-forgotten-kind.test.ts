import { expect, test } from 'bun:test';
import { erasureFinishedCodec, erasureStartedCodec, writeRecords } from '@heynixie/log';
import { buildEventRegistry, readEventsNote } from '@heynixie/sessions';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { readItemShortID } from '../test-utils/read-item-short-id';
import { startTestMemory } from '../test-utils/start-test-memory';
import type { MomentTables } from '../utils/moment-context';
import type { ForgottenKind } from './build-forgotten-kind';
import { buildForgottenKind } from './build-forgotten-kind';

interface MessageForget {
  readonly by: 'user' | 'assistant';
  readonly parentID: string | null;
}

async function setupTest() {
  const clock = createFakeClock({ startMs: Date.UTC(2025, 9, 14, 3, 5) });

  const memory = await startTestMemory({ logClock: clock, gate: { clock } });

  const readLines = async (off?: ForgottenKind) => {
    const notices = {
      memory: true,
      moment: true,
      message: true,
      ...(off === undefined ? {} : { [off]: false }),
    };

    const note = await readEventsNote(
      buildEventRegistry([buildForgottenKind(memory.log, notices)]),
      { after: 0, through: 100_000 },
      { ownerName: null, timeZone: 'UTC' },
    );

    return note === null ? [] : note.split('\n').slice(1);
  };

  const rememberItem = (text: string) =>
    memory.store.remember({
      text,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    });

  const forgetItem = (
    target: Awaited<ReturnType<typeof rememberItem>>,
    origin: 'owner' | 'conversation',
  ) =>
    memory.store.forget({
      target,
      provenance: {
        origin,
        source: 'owner',
        taskID: origin === 'owner' ? null : 'conversation',
        proposalID: null,
        checks: null,
      },
    });

  const keepMoment = async (title: string) => {
    const [message] = await writeRecords(memory.log, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        erasable: { text: 'the shed stays green' },
      },
    ]);

    invariant(message);

    const kept = await memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title,
    });

    invariant(kept.status === 'written');

    const row = await memory.log.writer.db
      .$extendTables<MomentTables>()
      .selectFrom('moments')
      .select('short_id')
      .where('moment_id', '=', kept.momentID)
      .executeTakeFirstOrThrow();

    invariant(row.short_id !== null);

    return { momentID: kept.momentID, shortID: row.short_id };
  };

  // the records a message forget writes, as the API's forget of a message writes them
  const writeMessageForget = async (sequence: number, options: MessageForget) => {
    const erasureID = `erasure-${String(sequence)}-${String(options.parentID)}`;

    await writeRecords(memory.log, [
      {
        kind: erasureStartedCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        payload: erasureStartedCodec.encode({
          erasureID,
          kind: 'record',
          targetID: String(sequence),
          shortID: null,
          version: null,
          parentID: options.parentID,
          by: options.by,
          capture: {
            keys: { ids: [] },
            cleanupKeys: [],
            sandboxCallIDs: [],
            purges: [],
            sessionCause: { recordSequence: sequence },
            turnInputs: { threads: [], cleaned: true, floor: null },
          },
          keyCount: 0,
        }),
      },
      {
        kind: erasureFinishedCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        payload: erasureFinishedCodec.encode({
          erasureID,
          kind: 'record',
          targetID: String(sequence),
          shortID: null,
          by: options.by,
          removedKeys: 0,
        }),
      },
    ]);
  };

  return { clock, memory, readLines, rememberItem, forgetItem, keepMoment, writeMessageForget };
}

test('it lists a finished forget of a memory item at the time it finished', async () => {
  const ctx = await setupTest();
  const item = await ctx.rememberItem('Lives on Elm Street');
  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  ctx.clock.advance(Date.UTC(2025, 9, 14, 3, 25) - ctx.clock.now());

  await ctx.forgetItem(item, 'owner');

  const lines = await ctx.readLines();

  expect(lines).toStrictEqual([`- Tue 14 Oct, 03:25, UTC · the owner forgot memory ${shortID}`]);
});

test('it lists a finished forget of a moment by the moment short ID', async () => {
  const ctx = await setupTest();
  const moment = await ctx.keepMoment('The shed colour');

  await ctx.memory.destroyMoment({ momentID: moment.momentID, version: 1 });

  const lines = await ctx.readLines();

  expect(lines).toStrictEqual([
    `- Tue 14 Oct, 03:05, UTC · the owner forgot moment ${moment.shortID}`,
  ]);
});

test('it lists a finished forget of a message by the message sequence', async () => {
  const ctx = await setupTest();

  await ctx.writeMessageForget(48_213, { by: 'user', parentID: null });

  const lines = await ctx.readLines();

  expect(lines).toStrictEqual(['- Tue 14 Oct, 03:05, UTC · the owner forgot message 48213']);
});

test.each(['memory', 'moment', 'message'] as const)(
  'it lists no %s forget when its notice is off',
  async (kind) => {
    const ctx = await setupTest();
    const item = await ctx.rememberItem('Lives on Elm Street');
    const moment = await ctx.keepMoment('The shed colour');

    await ctx.forgetItem(item, 'owner');
    await ctx.memory.destroyMoment({ momentID: moment.momentID, version: 1 });
    await ctx.writeMessageForget(48_213, { by: 'user', parentID: null });

    const lines = await ctx.readLines(kind);

    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).not.toInclude(`forgot ${kind} `);
  },
);

test('it lists no forget by the assistant', async () => {
  const ctx = await setupTest();
  const item = await ctx.rememberItem('Lives on Elm Street');

  await ctx.forgetItem(item, 'conversation');
  await ctx.writeMessageForget(48_213, { by: 'assistant', parentID: null });

  const lines = await ctx.readLines();

  expect(lines).toStrictEqual([]);
});

test('it lists no message that another forget reached', async () => {
  const ctx = await setupTest();

  await ctx.writeMessageForget(48_213, { by: 'user', parentID: 'erasure-of-an-image' });

  const lines = await ctx.readLines();

  expect(lines).toStrictEqual([]);
});

test('it holds no text that the forget erased, when an item reads the same as the message', async () => {
  const ctx = await setupTest();
  const item = await ctx.rememberItem('Why the boiler keeps tripping');

  await ctx.forgetItem(item, 'owner');

  const lines = await ctx.readLines();

  expect(lines).toHaveLength(1);
  expect(lines.join('\n')).not.toInclude('boiler');
});
