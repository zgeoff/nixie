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

async function setupTest(pageSize?: number) {
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
      buildEventRegistry([buildForgottenKind(memory.log, notices, pageSize)]),
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
    isFinishDeferred = false,
  ) =>
    memory.store.forget({
      isFinishDeferred,
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

  // the records that the runner writes for a message that another forget reached, such as the
  // messages of a forgotten image
  const writeReachedMessageForget = async () => {
    const [message] = await writeRecords(memory.log, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        erasable: { text: 'the shed stays green' },
      },
    ]);

    invariant(message);

    const target = {
      kind: 'record',
      targetID: String(message.sequence),
      shortID: null,
      by: 'user',
    } as const;

    await writeRecords(memory.log, [
      {
        kind: erasureStartedCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        payload: erasureStartedCodec.encode({
          ...target,
          erasureID: 'erasure-of-a-message',
          version: null,
          parentID: 'erasure-of-an-image',
          capture: {
            keys: { ids: [] },
            cleanupKeys: [],
            sandboxCallIDs: [],
            purges: [],
            sessionCause: { recordSequence: message.sequence },
            turnInputs: { threads: [], cleaned: true, floor: null },
          },
          keyCount: 0,
        }),
      },
      {
        kind: erasureFinishedCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        payload: erasureFinishedCodec.encode({
          ...target,
          erasureID: 'erasure-of-a-message',
          removedKeys: 0,
        }),
      },
    ]);
  };

  return {
    clock,
    memory,
    readLines,
    rememberItem,
    forgetItem,
    keepMoment,
    writeReachedMessageForget,
  };
}

test('it lists a finished forget of a memory item at the time it finished, not the time it started', async () => {
  const ctx = await setupTest();
  const item = await ctx.rememberItem('Lives on Elm Street');
  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  ctx.clock.advance(Date.UTC(2025, 9, 14, 3, 15) - ctx.clock.now());

  await ctx.forgetItem(item, 'owner', true);

  ctx.clock.advance(Date.UTC(2025, 9, 14, 3, 25) - ctx.clock.now());

  await ctx.memory.store.finishForgets([item.itemID]);

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

test.each(['memory', 'moment'] as const)(
  'it lists no %s forget when its notice is off',
  async (kind) => {
    const ctx = await setupTest();
    const item = await ctx.rememberItem('Lives on Elm Street');
    const moment = await ctx.keepMoment('The shed colour');

    await ctx.forgetItem(item, 'owner');
    await ctx.memory.destroyMoment({ momentID: moment.momentID, version: 1 });

    const lines = await ctx.readLines(kind);

    expect(lines).toHaveLength(1);
    expect(lines.join('\n')).not.toInclude(`forgot ${kind} `);
  },
);

test('it lists no forget by the assistant', async () => {
  const ctx = await setupTest();
  const item = await ctx.rememberItem('Lives on Elm Street');

  await ctx.forgetItem(item, 'conversation');

  const lines = await ctx.readLines();

  expect(lines).toStrictEqual([]);
});

test('it lists no message that another forget reached', async () => {
  const ctx = await setupTest();

  await ctx.writeReachedMessageForget();

  const lines = await ctx.readLines();

  expect(lines).toStrictEqual([]);
});

test('it counts every forget past the events cap when they span several pages', async () => {
  const ctx = await setupTest(2);

  for (const index of Array.from({ length: 13 }, (_, count) => count)) {
    const item = await ctx.rememberItem(`Lives on street number ${String(index)}`);

    await ctx.forgetItem(item, 'owner');
  }

  const lines = await ctx.readLines();

  expect(lines).toHaveLength(11);
  expect(lines.at(-1)).toBe('…and 3 more');
});

test('it holds no text that the forget erased, when an item reads the same as the message', async () => {
  const ctx = await setupTest();
  const item = await ctx.rememberItem('Why the boiler keeps tripping');

  await ctx.forgetItem(item, 'owner');

  const lines = await ctx.readLines();

  expect(lines).toHaveLength(1);
  expect(lines.join('\n')).not.toInclude('boiler');
});
