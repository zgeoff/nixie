import type { ConnectorContext } from '@heynixie/connections';

// The live connections a run may use for a tool: all of them with no pins, otherwise those the pins
// name.
export function pickPinnedContexts(
  live: readonly ConnectorContext[],
  pinned: readonly string[] | undefined,
): readonly ConnectorContext[] {
  return pinned === undefined ? live : live.filter((entry) => pinned.includes(entry.connection));
}
