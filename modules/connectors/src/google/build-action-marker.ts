// The private marker that a Calendar or Drive change writes in the same request as the change: one
// property per action. The value is the time the action was queued, the same for every attempt,
// so a search by key and value finds the write of any attempt.
export interface ActionMarker {
  readonly key: string;
  readonly value: string;
}

export const markerPrefix = 'nixie';

// the markers kept on an item, the new one included
export const keptMarkerCount = 10;
const markerKeyPattern = /^nixie[0-9a-f]{32}$/u;

export function buildActionMarker(actionID: string, queuedSeconds: number): ActionMarker {
  return {
    key: `${markerPrefix}${actionID.replaceAll('-', '')}`,
    value: String(queuedSeconds),
  };
}

export function collectMarkerKeys(properties: Readonly<Record<string, string>>): string[] {
  return Object.keys(properties).filter((key) => markerKeyPattern.test(key));
}

// The markers an item carries besides the new one that a write must delete, so the item keeps the
// newest ones: the new marker and the newest of the rest, up to the kept count.
export function collectStaleMarkerKeys(
  properties: Readonly<Record<string, string>>,
  marker: ActionMarker,
): string[] {
  const others = collectMarkerKeys(properties)
    .filter((key) => key !== marker.key)
    .toSorted((left, right) => {
      const byValue = Number(properties[right]) - Number(properties[left]);

      return byValue === 0 ? left.localeCompare(right) : byValue;
    });

  return others.slice(keptMarkerCount - 1);
}

// Whether a missing marker proves that the action's write never landed: a write deletes the older
// markers beyond the kept count, so an item at the count may have lost this one.
export function isMarkerLossProvable(properties: Readonly<Record<string, string>>): boolean {
  return collectMarkerKeys(properties).length < keptMarkerCount;
}
