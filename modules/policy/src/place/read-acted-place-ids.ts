import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { placesActedCodec } from './places-acted-codec';

export interface ActedPlaceQuery {
  readonly thread: string;
  readonly callID: string;

  // the sequence of the call's own record; its act records come after it
  readonly afterSequence: number;
}

const pageSize = 200;

// The places that already hold an act record for one call, found by paging every act record of the
// thread after the call, so a long thread never hides an earlier one.
export async function readActedPlaceIDs(
  log: Log,
  query: ActedPlaceQuery,
): Promise<ReadonlySet<string>> {
  const found = new Set<string>();

  let cursor = query.afterSequence;

  for (;;) {
    const page = await readRecords(log, {
      afterSequence: cursor,
      kinds: [placesActedCodec.kind],
      thread: query.thread,
      limit: pageSize,
    });

    for (const entry of page) {
      const acted = placesActedCodec.tryDecodePartial(entry.record.payload);

      if (acted?.callID === query.callID && acted.placeID !== undefined) {
        found.add(acted.placeID);
      }
    }

    const last = page.at(-1);

    if (last === undefined || page.length < pageSize) {
      return found;
    }

    cursor = last.record.sequence;
  }
}
