import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TurnMemory } from '@heynixie/sessions';
import { memoryRecalledCodec } from '@heynixie/sessions';
import { readDeliverableItems } from '../item/read-deliverable-items';
import type { RecalledItem, SearchMode, StoreParts } from '../types';
import type { TurnSelection } from './select-turn-memory';
import type { PushPick } from './types';

// Loads each pick's current text version under the delivery lock and records that version. A pick
// pinned, retired or forgotten since the selection drops out, and nothing refills the cap.
export function placeTurnMemory(
  parts: StoreParts,
  thread: string,
  selection: Extract<TurnSelection, { kind: 'selected' }>,
): Promise<TurnMemory> {
  return parts.lock(async () => {
    const loaded = await readDeliverableItems(parts, {
      itemIDs: selection.picks.map((pick) => pick.itemID),
      states: ['active'],
      includeHistory: false,
    });

    const items = loaded.filter((item) => !item.isPinned);

    if (items.length === 0 && selection.messages.length === 0) {
      return { kind: 'none' };
    }

    if (items.length > 0) {
      await writeRecallRecord(parts, {
        thread,
        items,
        picks: selection.picks,
        searchMode: pickSearchMode(selection.searchModes),
      });
    }

    return {
      kind: 'placed',
      items: items.filter((item) => item.subject !== 'self'),
      selfNotes: items.filter((item) => item.subject === 'self'),
      messages: selection.messages,
    };
  });
}

interface TurnRecallRecord {
  readonly thread: string;
  readonly items: readonly RecalledItem[];
  readonly picks: readonly PushPick[];
  readonly searchMode: SearchMode;
}

async function writeRecallRecord(parts: StoreParts, recall: TurnRecallRecord): Promise<void> {
  const log = parts.context.log;

  const scores = new Map(recall.picks.map((pick) => [pick.itemID, pick]));

  await withWriteTransaction(log.writer, (tx) =>
    writeRecordsInTransaction(tx, log, [
      {
        kind: memoryRecalledCodec.kind,
        definitions: parts.context.definitions(),
        thread: recall.thread,
        payload: memoryRecalledCodec.encode({
          items: recall.items.map((item) => {
            const pick = scores.get(item.itemID);

            return {
              itemID: item.itemID,
              version: item.version,
              ...(pick?.score === undefined ? {} : { score: pick.score }),
              ...(pick?.similarity === undefined ? {} : { similarity: pick.similarity }),
            };
          }),
          searchMode: recall.searchMode,
        }),
      },
    ]),
  );
}

// A fallback in any search shows in the record, then a hybrid search, then keyword only.
function pickSearchMode(modes: readonly SearchMode[]): SearchMode {
  if (modes.includes('keyword-fallback')) {
    return 'keyword-fallback';
  }

  return modes.includes('hybrid') ? 'hybrid' : 'keyword';
}
