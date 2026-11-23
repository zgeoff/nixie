import type { JSONObject } from '@heynixie/log';
import type { ToolOutcome } from '@heynixie/tools';
import { recallPageLimitBytes } from '@heynixie/wire';
import type { EntryPage } from '../index-block/types';
import { buildHiddenUUIDs } from '../utils/build-hidden-uuids';

export interface PageShape<T> {
  readonly key: 'lines' | 'topics' | 'items';
  readonly toEntry: (entry: T) => JSONObject;

  // what the stored result keeps of the page's entries
  readonly toRecordEntries: (entries: readonly T[]) => JSONObject;
  readonly toUUIDs: (entry: T) => readonly (readonly [string, string])[];

  // the cursor that continues after an entry, for a list that pages by key; without it the cursor
  // is the offset of the first entry left out
  readonly toCursor?: (entry: T) => string;
}

export interface PageCall {
  readonly offset: number;
  readonly searched: JSONObject;
}

// The result of one page of a list that the store holds whole: the entries that fit the page limit,
// and the cursor of the first one left out.
export function buildPageOutcome<T>(
  page: EntryPage<T>,
  shape: PageShape<T>,
  call: PageCall,
): ToolOutcome {
  const kept = cutEntries(page.entries, shape, call.searched);
  const end = call.offset + kept.length;
  const last = kept.at(-1);

  const next =
    end < page.total
      ? ((last === undefined ? undefined : shape.toCursor?.(last)) ?? String(end))
      : null;

  const leftOut: JSONObject =
    end < page.total ? { leftOut: { count: page.total - end, itemIDs: [], versions: 0 } } : {};

  return {
    status: 'ok',
    result: {
      [shape.key]: kept.map((entry) => shape.toEntry(entry)),
      next,
      searched: call.searched,
      ...leftOut,
    },
    record: { ...shape.toRecordEntries(kept), next, ...leftOut },
    ...buildHiddenUUIDs(kept.flatMap((entry) => shape.toUUIDs(entry))),
  };
}

// The envelope is measured with `next` and `leftOut` at the most they can take. The page always
// keeps its first entry, so a call that continues from `next` makes progress.
function cutEntries<T>(
  entries: readonly T[],
  shape: PageShape<T>,
  searched: JSONObject,
): readonly T[] {
  const envelope = Buffer.byteLength(
    JSON.stringify({
      [shape.key]: [],
      next: '9'.repeat(20),
      searched,
      leftOut: { count: 999_999, itemIDs: [], versions: 0 },
    }),
  );

  let used = envelope;
  const kept: T[] = [];

  for (const entry of entries) {
    const bytes = Buffer.byteLength(JSON.stringify(shape.toEntry(entry))) + 1;

    if (kept.length > 0 && used + bytes > recallPageLimitBytes) {
      break;
    }

    used += bytes;

    kept.push(entry);
  }

  return kept;
}
