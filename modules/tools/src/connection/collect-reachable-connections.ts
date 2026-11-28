import type { ConnectionChoice } from '../call-record/tool-call-options';

// The connections a run may pass to a tool: those its pins name that are still live, in the order
// the connections were made.
export function collectReachableConnections(
  pinned: readonly string[],
  live: readonly ConnectionChoice[],
): ConnectionChoice[] {
  return live.filter((choice) => pinned.includes(choice.connection));
}
