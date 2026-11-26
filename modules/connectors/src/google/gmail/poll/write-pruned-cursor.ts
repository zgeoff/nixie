import { toCursorJSON } from './to-cursor-json';
import type { GmailConnection, PollRun } from './types';

// Drops the cursor entry of each connection that the list no longer holds, in a delivery of its own,
// so a forgotten connection leaves nothing in the cursor even when no poll follows.
export async function writePrunedCursor(
  run: PollRun,
  connections: readonly GmailConnection[],
): Promise<void> {
  const live = new Set(connections.map((connection) => connection.connectionID));

  for (const id of run.states.keys()) {
    if (!live.has(id)) {
      run.states.delete(id);
    }
  }

  const kept = Object.entries(run.cursor).filter(([id]) => live.has(id));

  if (kept.length === Object.keys(run.cursor).length) {
    return;
  }

  const pruned = Object.fromEntries(kept);

  await run.trigger.deliver({ cursor: toCursorJSON(pruned), events: [] });

  run.cursor = pruned;
}
