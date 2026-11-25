import type { ConnectorAction } from '@heynixie/connectors';
import type { ActionsWithCoding } from '../coding/add-coding-connectors';

// The queued Gmail tools run through the action queue, which finds each by its tool name. The
// connector's reads run in the tool list and add nothing here.
export function addGoogleConnectors(
  actions: ActionsWithCoding,
  googleActions: readonly ConnectorAction[],
): ActionsWithCoding {
  const queued = googleActions.flatMap((action) =>
    action.queued === undefined ? [] : [[action.tool.name, action.queued] as const],
  );

  return { ...actions, connectors: new Map([...actions.connectors, ...queued]) };
}
