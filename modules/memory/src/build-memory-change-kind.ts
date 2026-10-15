import type { Log } from '@heynixie/log';
import type { EventKind, NotedEvent } from '@heynixie/models';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { OutsideVersion } from './read-outside-versions';
import { readOutsideVersions } from './read-outside-versions';
import type { MemoryStore } from './types';

// One item that changed outside the conversation, at its latest version in the range. The block
// fills in its short ID and text only when it lists the event.
export interface MemoryChangeEvent {
  readonly itemID: string;

  // whether the range holds the item's first version, so the line reads as a new memory
  readonly isCreated: boolean;
  readonly noted: NotedItem | null;
}

interface NotedItem {
  // the item's short ID, which the model reads it by
  readonly shortID: string;
  readonly state: 'active' | 'retired';
  readonly text: string;
}

// The event kind for an item changed outside the conversation, listed once at its latest version.
// Its text comes through a recall marked as a turn note's, so a rating binds past it, and an item
// a forget has begun drops out. The catch-up's versions belong to the catch-up kind.
export function buildMemoryChangeKind(
  log: Pick<Log, 'writer'>,
  store: Pick<MemoryStore, 'recall'>,
): EventKind<MemoryChangeEvent> {
  return {
    name: 'memory_change',
    read: async (range) => {
      const versions = await readOutsideVersions(log, range);

      return collectLatestVersions(versions.listed);
    },
    complete: (events) => readNotedItems(store, events),
    render: (detail) => {
      invariant(detail.noted, 'a listed memory change has its recalled text');

      const shortID = detail.noted.shortID;
      const text = detail.noted.text;

      if (detail.noted.state === 'retired') {
        return `Retired from memory [${shortID}]: "${text}"`;
      }

      return detail.isCreated
        ? `Remembered [${shortID}]: "${text}"`
        : `Changed in memory [${shortID}], which now reads: "${text}"`;
    },
  };
}

// each changed item once, at its latest version, oldest first
function collectLatestVersions(
  versions: readonly OutsideVersion[],
): readonly NotedEvent<MemoryChangeEvent>[] {
  const latest = new Map<string, NotedEvent<MemoryChangeEvent>>();

  for (const version of versions) {
    const first = latest.get(version.item_id);

    latest.delete(version.item_id);

    latest.set(version.item_id, {
      sequence: version.sequence,
      at: version.recorded_at,
      detail: {
        itemID: version.item_id,
        isCreated: first?.detail.isCreated === true || version.change === 'created',
        noted: null,
      },
    });
  }

  return [...latest.values()];
}

// The listed items' current text, through a recall that records what it delivered as a turn
// note's and leaves out an item that a forget has begun.
async function readNotedItems(
  store: Pick<MemoryStore, 'recall'>,
  events: readonly NotedEvent<MemoryChangeEvent>[],
): Promise<readonly NotedEvent<MemoryChangeEvent>[]> {
  if (events.length === 0) {
    return [];
  }

  const result = await store.recall({
    itemIDs: events.map((event) => event.detail.itemID),
    includeRetired: true,
    limit: events.length,
    thread: conversationTaskID,
    isTurnNote: true,
  });

  const items = new Map(result.items.map((item) => [item.itemID, item]));

  return events.flatMap((event) => {
    const item = items.get(event.detail.itemID);

    if (item === undefined) {
      return [];
    }

    return [
      {
        ...event,
        detail: {
          ...event.detail,
          noted: { shortID: item.shortID, state: item.state, text: item.text },
        },
      },
    ];
  });
}
