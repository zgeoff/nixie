import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { removeTestRecordKey, startTestLog } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { knownContactsProjection } from './known-contacts-projection';
import { readKnownContactIDs, readKnownContacts } from './read-known-contacts';
import { writeContactMarked } from './write-contact-marked';
import { writeContactUnmarked } from './write-contact-unmarked';

async function setupTest() {
  const started = await startTestLog();

  const log = {
    ...started.log,
    projections: [...started.log.projections, knownContactsProjection],
  };

  return {
    log,
    clock: started.clock,
    context: { log, clock: started.clock, definitions: () => ({ snapshotHash: 'snapshot-1' }) },
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

test('it keeps the contact but loses its details when a forget removes the marking record', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: 'Sam',
  });

  const [entry] = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['policy.contact_marked_known'],
  });

  invariant(entry);

  await removeTestRecordKey(ctx.log, entry.record.sequence);

  const held = await readKnownContacts(ctx.log);

  expect(held).toStrictEqual([
    {
      contactID: marked.contact.contactID,
      name: null,
      destination: null,
      markedAt: expect.toBeNumber(),
    },
  ]);
});

test('it reads a contact of a snapshot after the contact is unmarked, and lists no unmarked contact otherwise', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: 'Sam',
  });

  const snapshotIDs = await readKnownContactIDs(ctx.log.writer.db);

  await writeContactUnmarked(ctx.context, marked.contact.contactID);

  const snapshotContacts = await readKnownContacts(ctx.log, snapshotIDs);
  const current = await readKnownContacts(ctx.log);

  expect({ snapshotContacts, current }).toStrictEqual({
    snapshotContacts: [
      {
        contactID: marked.contact.contactID,
        name: 'Sam',
        destination: 'sam@example.org',
        markedAt: expect.toBeNumber(),
      },
    ],
    current: [],
  });
});
