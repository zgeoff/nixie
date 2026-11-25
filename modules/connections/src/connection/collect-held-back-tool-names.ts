import type { ConnectorAction } from '@heynixie/connectors';
import type { ConnectionMissingScope } from '../types';

// The tools no live connection can run: those with a scope that every live connection lacks. Tools
// stay listed while a connection has all their scopes, because a call names the connection. With no
// live connection, no tool is held back, because there is nothing to compare.
export function collectHeldBackToolNames(
  actions: readonly ConnectorAction[],
  missingByConnection: readonly (readonly ConnectionMissingScope[])[],
): string[] {
  const [first, ...others] = missingByConnection;

  if (first === undefined) {
    return [];
  }

  const absentEverywhere = new Set(
    first
      .map((entry) => entry.scope)
      .filter((scope) => others.every((missing) => missing.some((entry) => entry.scope === scope))),
  );

  return actions
    .filter((action) => action.scopes.some((scope) => absentEverywhere.has(scope)))
    .map((action) => action.tool.name);
}
