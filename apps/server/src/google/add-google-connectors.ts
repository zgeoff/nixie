import { googleToolPrefixes } from '@heynixie/connector-google';
import type { ConnectorAction } from '@heynixie/connectors';
import type { ActionsWithCoding } from '../coding/add-coding-connectors';

type GoogleActionsTarget = Pick<ActionsWithCoding, 'connectors' | 'readHeldToolPrefixes'>;

// The queued Gmail tools run through the action queue, which finds each by its tool name. The
// connector's reads run in the tool list and add nothing here. With Google off, an action of a
// Google tool stays pending, so the runner never fails it as an unknown tool.
export function addGoogleConnectors<Actions extends GoogleActionsTarget>(
  actions: Actions,
  googleActions: readonly ConnectorAction[] | null,
): Actions {
  if (googleActions === null) {
    const readHeld = actions.readHeldToolPrefixes;

    return {
      ...actions,
      readHeldToolPrefixes: () => [...(readHeld?.() ?? []), ...googleToolPrefixes],
    };
  }

  const queued = googleActions.flatMap((action) =>
    action.queued === undefined ? [] : [[action.tool.name, action.queued] as const],
  );

  return { ...actions, connectors: new Map([...actions.connectors, ...queued]) };
}
