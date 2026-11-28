import type { ConnectorAction } from '../connector/types';
import type { ConnectionMissingScope } from '../types';

export interface ConnectionScopes {
  // the short names of the scopes the last check found granted
  readonly granted: readonly string[];
  readonly missing: readonly ConnectionMissingScope[];
}

// The names of the tools all of whose scopes the connection holds. A scope that the last check never
// saw, such as one a later release added to a tool, is not held.
export function collectCoveredToolNames(
  actions: readonly ConnectorAction[],
  scopes: ConnectionScopes,
): string[] {
  return actions
    .filter((action) =>
      action.scopes.every(
        (scope) =>
          scopes.granted.includes(scope) && !scopes.missing.some((entry) => entry.scope === scope),
      ),
    )
    .map((action) => action.tool.name);
}
