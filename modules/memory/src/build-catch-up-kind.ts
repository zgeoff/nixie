import type { Log } from '@heynixie/log';
import type { EventKind } from '@heynixie/models';
import { readOutsideVersions } from './read-outside-versions';

// How many items the memory writer's catch-up took in over the range.
export interface CatchUpEvent {
  readonly itemCount: number;
}

// The event kind for the memory writer's catch-up over earlier conversation. Its items count as
// one event at the newest of their versions, and never list one by one.
export function buildCatchUpKind(log: Pick<Log, 'writer'>): EventKind<CatchUpEvent> {
  return {
    name: 'memory_catch_up',
    read: async (range) => {
      const versions = await readOutsideVersions(log, range);

      const newest = versions.catchUp.at(-1);

      if (newest === undefined) {
        return [];
      }

      const itemCount = new Set(versions.catchUp.map((version) => version.item_id)).size;

      return [{ sequence: newest.sequence, at: newest.recorded_at, detail: { itemCount } }];
    },
    render: (detail) =>
      `Your note-taker took in ${String(detail.itemCount)} ${detail.itemCount === 1 ? 'thing' : 'things'} from earlier conversation.`,
  };
}
