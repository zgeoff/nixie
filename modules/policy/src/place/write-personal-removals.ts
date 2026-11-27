import type { Log } from '@heynixie/log';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { findPlaceLink } from './find-place-link';
import { placesRemovedCodec } from './places-removed-codec';
import type { PlaceRemoval } from './write-removed-sequence';
import { writeRemovedSequence } from './write-removed-sequence';

// Marks each address, phone or handle entry removed by its removal record. The fold cannot read the
// place ID, which sits in the record's erasable fields, so a rebuild and the server start run this.
// A removal that a forget shredded marks nothing: its entry has no key left, so it covers nothing.
export async function writePersonalRemovals(log: Log): Promise<void> {
  const removals = await readPersonalRemovals(log);

  if (removals.length === 0) {
    return;
  }

  await withWriteTransaction(log.writer, async (tx) => {
    for (const removal of removals) {
      await writeRemovedSequence(tx, removal);
    }
  });
}

const pageSize = 500;

async function readPersonalRemovals(log: Log): Promise<readonly PlaceRemoval[]> {
  const found: PlaceRemoval[] = [];
  let cursor = 0;

  for (;;) {
    const page = await readRecords(log, {
      afterSequence: cursor,
      kinds: [placesRemovedCodec.kind],
      limit: pageSize,
    });

    for (const entry of page) {
      const link = entry.record.erasable.status === 'none' ? null : findPlaceLink(entry.record);

      if (link !== null) {
        found.push({ placeID: link.placeID, sequence: entry.record.sequence });
      }
    }

    const last = page.at(-1);

    if (last === undefined || page.length < pageSize) {
      return found;
    }

    cursor = last.record.sequence;
  }
}
