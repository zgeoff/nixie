import type { ConnectorAction } from '../connector/types';
import type { ConnectionMissingScope } from '../types';

// The names of the tools none of whose scopes the connection lacks.
export function collectCoveredToolNames(
  actions: readonly ConnectorAction[],
  missing: readonly ConnectionMissingScope[],
): string[] {
  return actions
    .filter(
      (action) => !action.scopes.some((scope) => missing.some((entry) => entry.scope === scope)),
    )
    .map((action) => action.tool.name);
}
