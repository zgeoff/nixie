import type { ConnectorAction } from '../connector/types';
import { collectCoveredToolNames } from '../status/collect-covered-tool-names';
import type { ConnectionScopes } from '../status/collect-covered-tool-names';

export interface ScopedConnection extends ConnectionScopes {
  // the short ID
  readonly connection: string;
}

// The short IDs of the connections that can run each connector tool, keyed by the tool's name: those
// that hold all its scopes. A tool no connection can run maps to an empty list, so a caller still
// sees the tool exists.
export function collectToolConnections(
  actions: readonly ConnectorAction[],
  connections: readonly ScopedConnection[],
): Record<string, string[]> {
  const covered = connections.map((entry) => ({
    connection: entry.connection,
    tools: collectCoveredToolNames(actions, entry),
  }));

  return Object.fromEntries(
    actions.map((action) => [
      action.tool.name,
      covered
        .filter((entry) => entry.tools.includes(action.tool.name))
        .map((entry) => entry.connection),
    ]),
  );
}
