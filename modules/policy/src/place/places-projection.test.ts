import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import {
  readTestProjectionDrift,
  removeTestRecordKey,
  startTestLog,
} from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { knownContactsProjection } from '../contact/known-contacts-projection';
import { writeContactMarked } from '../contact/write-contact-marked';
import { placesProjection } from './places-projection';
import { writePlaceAdded } from './write-place-added';
import { writePlaceRemoved } from './write-place-removed';

async function setupTest() {
  const started = await startTestLog();

  const log = {
    ...started.log,
    projections: [...started.log.projections, knownContactsProjection, placesProjection],
  };

  return {
    log,
    context: {
      log,
      clock: started.clock,
      definitions: () => ({ snapshotHash: 'snapshot-1' }),
      runInForce: () => Promise.resolve(),
    },
  };
}

test('it gives the same rows and changes after a rebuild when a call uses a known contact', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'robin@example.org',
    name: 'Robin',
  });

  await writeRecords(ctx.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'snapshot-1' },
      thread: 'conversation',
      decision: {
        outcome: 'allow',
        stage: 5,
        rule: null,
        permissions: [{ by: 'place', placeID: marked.contact.contactID, trust: 'known' }],
      },
      payload: { tool: 'gmail.send' },
    },
  ]);

  const drift = await readTestProjectionDrift(ctx.log);

  expect(drift).toStrictEqual([]);
});

test('it gives the same rows and changes after a rebuild when a replayed call uses a removed address place', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'robin@example.org' },
    trust: 'act',
    name: null,
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  await writePlaceRemoved(ctx.context, added.placeID);

  await writeRecords(ctx.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'snapshot-1' },
      thread: 'conversation',
      decision: {
        outcome: 'allow',
        stage: 5,
        rule: null,
        permissions: [{ by: 'place', placeID: added.placeID, trust: 'act' }],
      },
      payload: { tool: 'gmail.send' },
    },
  ]);

  const drift = await readTestProjectionDrift(ctx.log);

  expect(drift).toStrictEqual([]);
});

test('it gives the same rows after a rebuild once the removal of an address place is forgotten', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'robin@example.org' },
    trust: 'act',
    name: null,
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  await writePlaceRemoved(ctx.context, added.placeID);

  const [removal] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['places.removed'] });

  invariant(removal);

  await removeTestRecordKey(ctx.log, removal.record.sequence);

  const drift = await readTestProjectionDrift(ctx.log);

  expect(drift).toStrictEqual([]);
});
