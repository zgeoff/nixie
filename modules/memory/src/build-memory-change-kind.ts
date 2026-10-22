import type { Log } from '@heynixie/log';
import type { EventKind, NotedEvent } from '@heynixie/sessions';
import { formatEventTime } from '@heynixie/sessions';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { OutsideVersion } from './read-outside-versions';
import { readOutsideVersions } from './read-outside-versions';
import type { MemoryOrigin, MemoryStore } from './types';

interface NotedItem {
  readonly shortID: string;
  readonly state: 'active' | 'retired';
  readonly text: string;
}

export interface MemoryChangeEvent {
  readonly itemID: string;

  readonly isCreated: boolean;
  readonly origin: MemoryOrigin;
  readonly until: number | null;
  readonly noted: NotedItem | null;
}

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
    render: (detail, settings) => {
      invariant(detail.noted, 'a listed memory change has its recalled text');

      const shortID = detail.noted.shortID;
      const text = detail.noted.text;

      if (detail.noted.state === 'retired' && detail.origin === 'lapse') {
        invariant(detail.until !== null, 'a lapsed memory item keeps its end time');

        return `Lapsed from memory [${shortID}], set to last until ${formatEventTime(detail.until, settings.timeZone)}: "${text}"`;
      }

      if (detail.noted.state === 'retired') {
        return `Retired from memory [${shortID}]: "${text}"`;
      }

      return detail.isCreated
        ? `Remembered [${shortID}]: "${text}"`
        : `Changed in memory [${shortID}], which now reads: "${text}"`;
    },
  };
}

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
        origin: version.origin,
        until: version.until,
        noted: null,
      },
    });
  }

  return [...latest.values()];
}

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
