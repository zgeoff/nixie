import type { ConnectorAction } from '../connector/types';
import type { ConnectionMissingScope } from '../types';

// The tools no live connection can run: those that every live connection lacks a scope of. A tool
// stays listed while one connection has all its scopes, because a call names the connection. With no
// live connection, no tool is held back, because there is nothing to compare.
export function collectHeldBackToolNames(
  actions: readonly ConnectorAction[],
  missingByConnection: readonly (readonly ConnectionMissingScope[])[],
): string[] {
  if (missingByConnection.length === 0) {
    return [];
  }

  return actions
    .filter((action) =>
      missingByConnection.every((missing) =>
        action.scopes.some((scope) => missing.some((entry) => entry.scope === scope)),
      ),
    )
    .map((action) => action.tool.name);
}
