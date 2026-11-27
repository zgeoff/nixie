import { expect, test } from 'bun:test';
import { readRecords, runProjectionRebuild } from '@heynixie/log';
import { removeTestRecordKey, startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { placesProjection } from '../place/places-projection';
import { writePlaceAdded } from '../place/write-place-added';
import { writePlaceChanged } from '../place/write-place-changed';
import { knownContactsProjection } from './known-contacts-projection';
import { readKnownContactIDs, readKnownContacts } from './read-known-contacts';
import { writeContactMarked } from './write-contact-marked';
import { writeContactUnmarked } from './write-contact-unmarked';

async function setupTest() {
  const started = await startTestLog();

  const log = {
    ...started.log,
    projections: [...started.log.projections, knownContactsProjection, placesProjection],
  };

  return {
    log,
    clock: started.clock,
    readKinds: async () => {
      const result = await sql`select kind from places order by added_sequence`.execute(
        log.writer.db,
      );

      return z
        .array(z.object({ kind: z.string() }))
        .parse(result.rows)
        .map((row) => row.kind);
    },
    context: {
      log,
      clock: started.clock,
      definitions: () => ({ snapshotHash: 'snapshot-1' }),
      runInForce: () => Promise.resolve(),
    },
  };
}

test('it holds a marked destination as a known contact with its name', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: 'Sam',
  });

  const listed = await readKnownContacts(ctx.log);

  expect(listed).toStrictEqual([
    {
      contactID: marked.contact.contactID,
      name: 'Sam',
      destination: 'sam@example.org',
      markedAt: expect.toBeNumber(),
    },
  ]);

  expect(marked.isNew).toBe(true);
});

test('it changes nothing when the destination is already a known contact', async () => {
  const ctx = await setupTest();

  const first = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: null,
  });

  const second = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: 'Sam',
  });

  expect({ id: second.contact.contactID, isNew: second.isNew }).toStrictEqual({
    id: first.contact.contactID,
    isNew: false,
  });

  const held = await readKnownContactIDs(ctx.log.writer.db);

  expect(held).toStrictEqual([first.contact.contactID]);
});

test('it matches a destination in its composed form', async () => {
  const ctx = await setupTest();

  const first = await writeContactMarked(ctx.context, {
    destination: 'café@example.org',
    name: null,
  });

  const second = await writeContactMarked(ctx.context, {
    destination: 'café@example.org',
    name: null,
  });

  expect(second.contact.contactID).toBe(first.contact.contactID);
});

test('it drops a contact from the held IDs once it is unmarked', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: null,
  });

  const isUnmarked = await writeContactUnmarked(ctx.context, marked.contact.contactID);

  expect(isUnmarked).toBe(true);

  const held = await readKnownContactIDs(ctx.log.writer.db);

  expect(held).toStrictEqual([]);
});

test('it reports no unmark for an ID that no known contact has', async () => {
  const ctx = await setupTest();
  const isUnmarked = await writeContactUnmarked(ctx.context, crypto.randomUUID());

  expect(isUnmarked).toBe(false);
});

test('it lists no contact once a forget removes its marking record', async () => {
  const ctx = await setupTest();

  await writeContactMarked(ctx.context, { destination: 'sam@example.org', name: 'Sam' });

  const [entry] = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['policy.contact_marked_known'],
  });

  invariant(entry);

  await removeTestRecordKey(ctx.log, entry.record.sequence);

  const listed = await readKnownContacts(ctx.log);

  expect(listed).toStrictEqual([]);
});

test('it lists no unmarked contact', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: 'Sam',
  });

  await writeContactUnmarked(ctx.context, marked.contact.contactID);

  const listed = await readKnownContacts(ctx.log);

  expect(listed).toStrictEqual([]);
});

test('it lists a place that the directory added at known, and no contact that the directory raised to read', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'jo@example.org' },
    trust: 'known',
    name: 'Jo',
    addedBy: 'you',
  });

  const marked = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: 'Sam',
  });

  invariant(added.status === 'added');

  await writePlaceChanged(ctx.context, { placeID: marked.contact.contactID, trust: 'read' });

  const listed = await readKnownContacts(ctx.log);

  expect(listed).toStrictEqual([
    {
      contactID: added.placeID,
      name: 'Jo',
      destination: 'jo@example.org',
      markedAt: expect.toBeNumber(),
    },
  ]);
});

test('it changes nothing when the destination is marked again in another case', async () => {
  const ctx = await setupTest();

  const first = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: null,
  });

  const second = await writeContactMarked(ctx.context, {
    destination: 'Sam@Example.org',
    name: null,
  });

  expect({ id: second.contact.contactID, isNew: second.isNew }).toStrictEqual({
    id: first.contact.contactID,
    isNew: false,
  });
});

test('it stores the kind of the key in the projection row of a marked contact', async () => {
  const ctx = await setupTest();

  await writeContactMarked(ctx.context, { destination: 'sam@example.org', name: null });
  await writeContactMarked(ctx.context, { destination: '+61 420 000 000', name: null });
  await writeContactMarked(ctx.context, { destination: 'front desk', name: null });

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual(['address', 'phone', 'raw']);
});

test('it stores the kind of the key in the projection row of a contact after a rebuild', async () => {
  const ctx = await setupTest();

  await writeContactMarked(ctx.context, { destination: 'sam@example.org', name: null });
  await runProjectionRebuild(ctx.log);

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual(['address']);
});
