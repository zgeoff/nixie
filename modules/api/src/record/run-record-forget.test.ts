import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { readRecordForgetPreview } from '@heynixie/memory';
import { buildMockWriteCaller, readPurgeRows } from '@heynixie/memory/test-utils';
import {
  readPlaces,
  writeContactMarked,
  writePlaceActed,
  writePlaceAdded,
  writePlaceChanged,
  writePlaceRemoved,
} from '@heynixie/policy';
import {
  reminderCancelledCodec,
  reminderSetCodec,
  reminderUpdatedCodec,
} from '@heynixie/reminders';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { seedQuotedMemoryItems } from '../test-utils/seed-quoted-memory-items';
import { startTestAPI } from '../test-utils/start-test-api';
import { startTestMemoryForgets } from '../test-utils/start-test-memory-forgets';
import type { CleanupRecordSessions } from '../types';
import { beginRecordForget } from './begin-record-forget';
import { readRecordForgetCheck } from './read-record-forget-check';
import { finishRecordForget, runRecordForget } from './run-record-forget';

async function setupTest() {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const forgets = await startTestMemoryForgets(api.context);

  return {
    ...api,
    ...forgets,
    seed: buildSeeder(api),
    writeOwnerMessage: async (text: string) => {
      const [record] = await writeRecords(api.context.log, [
        {
          kind: 'owner_message',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          erasable: { text, spans: [] },
        },
      ]);

      invariant(record);

      return record.sequence;
    },
    readKinds: async () => {
      const entries = await readRecords(api.context.log, { afterSequence: 0 });

      return entries.map((entry) => entry.record.kind);
    },
    readSequences: async (kind: 'memory.evidence_purged' | 'erasure.finished') => {
      const entries = await readRecords(api.context.log, { afterSequence: 0, kinds: [kind] });

      return entries.map((entry) => entry.record.sequence);
    },
  };
}

test('it forgets a record with no caller check and runs the session cleanup once', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  ctx.setSessionCleanup(cleanupSessions);

  const forgotten = await runRecordForget(ctx.context, { thread: 'conversation', sequence });

  expect(forgotten).toStrictEqual({ status: 'forgotten', forgottenAt: expect.toBeNumber() });
  expect(cleanupSessions).toHaveBeenCalledExactlyOnceWith({ recordSequence: sequence });

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual([
    'task.created',
    'owner_message',
    'erasure.started',
    'erasure.finished',
  ]);
});

test('it answers forgotten and writes nothing more when the record is already forgotten', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  await runRecordForget(ctx.context, { thread: 'conversation', sequence });

  const before = await ctx.readKinds();
  const again = await runRecordForget(ctx.context, { thread: 'conversation', sequence });
  const after = await ctx.readKinds();

  expect(again).toStrictEqual({ status: 'forgotten', forgottenAt: expect.toBeNumber() });
  expect(after).toStrictEqual(before);
});

test('it answers not_found for a sequence that holds no record on the thread', async () => {
  const ctx = await setupTest();
  const result = await runRecordForget(ctx.context, { thread: 'conversation', sequence: 9999 });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test('it answers wrong_kind with the kind of a record that carries no text of its own', async () => {
  const ctx = await setupTest();

  const [offered] = await writeRecords(ctx.context.log, [
    {
      kind: 'memory.image_offered',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { messageSequence: 1, image: 1, runID: 'run-offer' },
      erasable: { text: 'A photo of the spare key in the shed.' },
    },
  ]);

  invariant(offered);

  const result = await runRecordForget(ctx.context, {
    thread: 'conversation',
    sequence: offered.sequence,
  });

  expect(result).toStrictEqual({ status: 'wrong_kind', kind: 'memory.image_offered' });

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual(['task.created', 'memory.image_offered']);
});

test('it answers action_not_finished for a queued action that has not run', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });

  const check = await readRecordForgetCheck(ctx.context.log.writer.db, {
    thread: 'conversation',
    sequence: action.queued_sequence,
  });

  expect(check).toStrictEqual({ status: 'action_not_finished' });
});

test('it reports the kind of a record that passes the check', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  const check = await readRecordForgetCheck(ctx.context.log.writer.db, {
    thread: 'conversation',
    sequence,
  });

  expect(check).toStrictEqual({ status: 'ok', kind: 'owner_message' });
});

test('it answers not_found for a record on another thread', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  const check = await readRecordForgetCheck(ctx.context.log.writer.db, {
    thread: 'some-task',
    sequence,
  });

  expect(check).toStrictEqual({ status: 'not_found' });
});

test('it lists in the purge set the items that the preview lists, and purges exactly those items', async () => {
  const ctx = await setupTest();
  const seeded = await seedQuotedMemoryItems(ctx.context, ctx.memory);

  const target = { thread: 'conversation', sequence: seeded.sequence };

  const preview = await readRecordForgetPreview(ctx.context.log, target);

  await runRecordForget(ctx.forgetContext, target);

  const rows = await readPurgeRows(ctx.context.log.writer.db);
  const unrelated = await ctx.memory.readHistory(seeded.unrelated.itemID);

  expect(preview.memoryItems.map((item) => item.itemID)).toStrictEqual([seeded.quoting.itemID]);

  expect(rows).toStrictEqual([
    {
      record_sequence: seeded.sequence,
      item_id: seeded.quoting.itemID,
      closed_sequence: expect.toBeNumber(),
      purged_sequence: expect.toBeNumber(),
    },
  ]);

  expect(unrelated?.versions).toMatchObject([{ version: 1, status: 'readable', isRemoved: false }]);
});

test('it writes the purge set in the start transaction, before any purge step runs', async () => {
  const ctx = await setupTest();
  const seeded = await seedQuotedMemoryItems(ctx.context, ctx.memory);

  await runRecordForget(ctx.context, { thread: 'conversation', sequence: seeded.sequence });

  const kinds = await ctx.readKinds();
  const rows = await readPurgeRows(ctx.context.log.writer.db);

  expect(kinds.slice(-3)).toStrictEqual([
    'memory.evidence_purge_started',
    'erasure.started',
    'erasure.finished',
  ]);

  expect(rows).toStrictEqual([
    {
      record_sequence: seeded.sequence,
      item_id: seeded.quoting.itemID,
      closed_sequence: null,
      purged_sequence: null,
    },
  ]);
});

test('it writes erasure.finished after the last mark of every item of the set', async () => {
  const ctx = await setupTest();
  const seeded = await seedQuotedMemoryItems(ctx.context, ctx.memory);

  await runRecordForget(ctx.forgetContext, { thread: 'conversation', sequence: seeded.sequence });

  const purged = await ctx.readSequences('memory.evidence_purged');
  const [forgotten] = await ctx.readSequences('erasure.finished');

  invariant(forgotten !== undefined);

  expect(purged).toHaveLength(1);
  expect(purged).toSatisfyAll((sequence: number) => sequence < forgotten);
});

test('it reads every value the purge deletes as removed from the forget start, and refuses a proposal for the item', async () => {
  const ctx = await setupTest();
  const seeded = await seedQuotedMemoryItems(ctx.context, ctx.memory);

  await runRecordForget(ctx.context, { thread: 'conversation', sequence: seeded.sequence });

  const history = await ctx.memory.readHistory(seeded.quoting.itemID);

  const proposal = ctx.memory.writes.remember({
    text: 'The cat uses the flap every evening',
    target: seeded.quoting,
    caller: buildMockWriteCaller(),
  });

  const refused = await proposal.catch((error: unknown) => error);

  expect(history?.versions).toMatchObject([
    { version: 1, status: 'shredded', isRemoved: true },
    { version: 2, status: 'readable', isRemoved: false },
  ]);

  expect(refused).toMatchObject({ code: 'ITEM_PURGING' });
});

test.each([
  [
    'reminder.set',
    reminderSetCodec.kind,
    reminderSetCodec.encode({
      reminderID: 'r1',
      shortID: 'abc',
      hash: 'h1',
      trigger: { at: '2027-03-09T14:00:00+11:00' },
      origin: 'conversation',
    }),
  ],
  [
    'reminder.updated',
    reminderUpdatedCodec.kind,
    reminderUpdatedCodec.encode({
      reminderID: 'r1',
      shortID: 'abc',
      hash: 'h2',
      trigger: { at: '2027-03-09T15:00:00+11:00' },
    }),
  ],
  [
    'reminder.cancelled',
    reminderCancelledCodec.kind,
    reminderCancelledCodec.encode({ reminderID: 'r1', shortID: 'abc' }),
  ],
])(
  'it refuses to forget a %s record, which holds no text of its own',
  async (_name, kind, payload) => {
    const ctx = await setupTest();

    const [written] = await writeRecords(ctx.context.log, [
      { kind, definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation', payload },
    ]);

    invariant(written);

    const result = await runRecordForget(ctx.context, {
      thread: 'conversation',
      sequence: written.sequence,
    });

    expect(result).toStrictEqual({ status: 'wrong_kind', kind });
  },
);

test('it forgets a personal place by its add record and erases its later name changes too', async () => {
  const ctx = await setupTest();

  const places = {
    log: ctx.context.log,
    definitions: ctx.context.definitions,
    runInForce: () => Promise.resolve(),
  };

  const added = await writePlaceAdded(places, {
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'known',
    name: 'Sam',
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  const changed = await writePlaceChanged(places, { placeID: added.placeID, name: 'Sam at work' });

  invariant(changed.status === 'changed');

  const [addRecord] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['places.added'],
  });

  invariant(addRecord);

  const forgotten = await runRecordForget(ctx.context, {
    thread: 'conversation',
    sequence: addRecord.record.sequence,
  });

  const changes = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['places.changed'],
  });

  expect({
    forgotten: forgotten.status,
    listed: await readPlaces(ctx.context.log),
    changeFields: changes.map((entry) => entry.record.erasable.status),
  }).toStrictEqual({ forgotten: 'forgotten', listed: [], changeFields: ['shredded'] });
});

test('it forgets a contact you marked by a later change of its entry and shreds its marking record', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: 'Sam',
  });

  const changed = await writePlaceChanged(
    {
      log: ctx.context.log,
      definitions: ctx.context.definitions,
      runInForce: () => Promise.resolve(),
    },
    { placeID: marked.contact.contactID, name: 'Sam at work' },
  );

  invariant(changed.status === 'changed');

  const [changeRecord] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['places.changed'],
  });

  invariant(changeRecord);

  const forgotten = await runRecordForget(ctx.context, {
    thread: 'conversation',
    sequence: changeRecord.record.sequence,
  });

  const markings = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['policy.contact_marked_known'],
  });

  expect({
    forgotten: forgotten.status,
    listed: await readPlaces(ctx.context.log),
    markingFields: markings.map((entry) => entry.record.erasable.status),
  }).toStrictEqual({ forgotten: 'forgotten', listed: [], markingFields: ['shredded'] });
});

test('it forgets a contact you marked by its marking record', async () => {
  const ctx = await setupTest();

  await writeContactMarked(ctx.context, { destination: 'sam@example.org', name: 'Sam' });

  const [marking] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['policy.contact_marked_known'],
  });

  invariant(marking);

  const forgotten = await runRecordForget(ctx.context, {
    thread: 'conversation',
    sequence: marking.record.sequence,
  });

  expect({
    forgotten: forgotten.status,
    listed: await readPlaces(ctx.context.log),
  }).toStrictEqual({ forgotten: 'forgotten', listed: [] });
});

test.each(['places.removed', 'places.acted'] as const)(
  'it forgets an address place from its %s record and leaves no removal or act that names it',
  async (kind) => {
    const ctx = await setupTest();

    const places = {
      log: ctx.context.log,
      definitions: ctx.context.definitions,
      runInForce: () => Promise.resolve(),
    };

    const added = await writePlaceAdded(places, {
      key: { kind: 'address', address: 'tickets@example.com' },
      trust: 'act',
      name: 'Tickets',
      addedBy: 'you',
    });

    invariant(added.status === 'added');

    await writePlaceActed(places, {
      placeID: added.placeID,
      shortID: added.shortID,
      callID: 'call-1',
      tool: 'mail.send',
      thread: 'conversation',
    });

    await writePlaceRemoved(places, added.placeID);

    const [target] = await readRecords(ctx.context.log, { afterSequence: 0, kinds: [kind] });

    invariant(target);

    const forgotten = await runRecordForget(ctx.context, {
      thread: 'conversation',
      sequence: target.record.sequence,
    });

    const links = await readRecords(ctx.context.log, {
      afterSequence: 0,
      kinds: ['places.added', 'places.acted', 'places.removed'],
    });

    expect({
      forgotten: forgotten.status,
      links: links.map((entry) => [entry.record.kind, entry.record.payload, entry.record.erasable]),
    }).toStrictEqual({
      forgotten: 'forgotten',
      links: [
        ['places.added', expect.any(Object), { status: 'shredded' }],
        ['places.acted', { callID: 'call-1', tool: 'mail.send' }, { status: 'shredded' }],
        ['places.removed', {}, { status: 'shredded' }],
      ],
    });
  },
);

test('it refuses to forget the removal of a site place, which holds nothing a key could erase', async () => {
  const ctx = await setupTest();

  const places = {
    log: ctx.context.log,
    definitions: ctx.context.definitions,
    runInForce: () => Promise.resolve(),
  };

  const added = await writePlaceAdded(places, {
    key: { kind: 'site', domain: 'tickets.example.com', subdomains: false },
    trust: 'act',
    name: null,
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  await writePlaceRemoved(places, added.placeID);

  const [removal] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['places.removed'],
  });

  invariant(removal);

  const forgotten = await runRecordForget(ctx.context, {
    thread: 'conversation',
    sequence: removal.record.sequence,
  });

  expect(forgotten).toStrictEqual({ status: 'wrong_kind', kind: 'places.removed' });
});

test("it shreds an act of a place written after the forget of the place's act began", async () => {
  const ctx = await setupTest();

  const places = {
    log: ctx.context.log,
    definitions: ctx.context.definitions,
    runInForce: () => Promise.resolve(),
  };

  const added = await writePlaceAdded(places, {
    key: { kind: 'phone', e164: '+61455501234' },
    trust: 'act',
    name: 'Front desk',
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  const act = {
    placeID: added.placeID,
    shortID: added.shortID,
    tool: 'phone.send',
    thread: 'conversation',
  };

  await writePlaceActed(places, { ...act, callID: 'call-1' });

  const [first] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['places.acted'],
  });

  invariant(first);

  await beginRecordForget(
    ctx.context,
    { thread: 'conversation', sequence: first.record.sequence },
    { by: 'user' },
  );

  await writePlaceActed(places, { ...act, callID: 'call-2' });
  await finishRecordForget(ctx.context, first.record.sequence);

  const acts = await readRecords(ctx.context.log, { afterSequence: 0, kinds: ['places.acted'] });

  expect(acts.map((entry) => entry.record.erasable.status)).toStrictEqual(['shredded', 'shredded']);
});

test('it shreds an act of a place written while the forget of the place act cleans up', async () => {
  const ctx = await setupTest();

  const places = {
    log: ctx.context.log,
    definitions: ctx.context.definitions,
    runInForce: () => Promise.resolve(),
  };

  const added = await writePlaceAdded(places, {
    key: { kind: 'phone', e164: '+61455501234' },
    trust: 'act',
    name: 'Front desk',
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  const act = {
    placeID: added.placeID,
    shortID: added.shortID,
    tool: 'phone.send',
    thread: 'conversation',
  };

  await writePlaceActed(places, { ...act, callID: 'call-1' });

  const [first] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['places.acted'],
  });

  invariant(first);

  let isWritten = false;

  ctx.setSessionCleanup(async () => {
    if (!isWritten) {
      isWritten = true;

      await writePlaceActed(places, { ...act, callID: 'call-2' });
    }
  });

  await runRecordForget(ctx.context, { thread: 'conversation', sequence: first.record.sequence });

  const acts = await readRecords(ctx.context.log, { afterSequence: 0, kinds: ['places.acted'] });

  expect(isWritten).toBe(true);
  expect(acts.map((entry) => entry.record.erasable.status)).toStrictEqual(['shredded', 'shredded']);
});
