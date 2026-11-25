import type { ConnectorAction, MissingScope } from '../types';

// The actions whose scopes are all granted. A tool that needs a scope the owner left out would fail
// on each call, which the model reads as a broken service, while a missing tool reads as a missing
// capability.
export function pickAvailableActions(
  actions: readonly ConnectorAction[],
  missing: readonly MissingScope[],
): ConnectorAction[] {
  const absent = new Set(missing.map((entry) => entry.scope));

  return actions.filter((action) => !action.scopes.some((scope) => absent.has(scope)));
}

// The names of the tools that one missing scope holds back, for the connection's page.
export function collectHeldBackTools(actions: readonly ConnectorAction[], scope: string): string[] {
  return actions
    .filter((action) => action.scopes.includes(scope))
    .map((action) => action.tool.name);
}
