import { buildConnectionPins } from './build-connection-pins';
import type { UsableConnections } from './build-connection-pins';

export interface SavedPinFacts {
  // the tools the definition lists, as the model wrote them
  readonly tools: readonly string[] | undefined;

  // the call's `connections` as it reaches the save: the pins the host resolved before the
  // decision, or the model's own list, or nothing
  readonly connections: readonly string[] | Readonly<Record<string, readonly string[]>> | undefined;

  readonly usable: UsableConnections;
}

export type SavedPins =
  | { readonly status: 'pinned'; readonly pins: Readonly<Record<string, readonly string[]>> }
  | { readonly status: 'unresolved' };

// The pins a define saves: the ones the host resolved before the decision, so the saved job holds
// what the approval showed. A call whose pins would come from the connections usable at save time,
// such as an approval written before the host resolved pins, saves nothing.
export function pickSavedPins(facts: SavedPinFacts): SavedPins {
  const given = facts.connections;

  if (given !== undefined && !isNamedList(given)) {
    return { status: 'pinned', pins: given };
  }

  if (given !== undefined) {
    return { status: 'unresolved' };
  }

  const built = buildConnectionPins({ tools: facts.tools, named: undefined, usable: facts.usable });

  return built.status === 'pinned' && Object.keys(built.pins).length === 0
    ? { status: 'pinned', pins: {} }
    : { status: 'unresolved' };
}

function isNamedList(
  connections: readonly string[] | Readonly<Record<string, readonly string[]>>,
): connections is readonly string[] {
  return Array.isArray(connections);
}
