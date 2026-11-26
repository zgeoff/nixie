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

// The markers an item holds besides the new one that a write must delete, so the item keeps the
// newest ten of all its markers, the new one counted by its own value.
export function collectStaleMarkerKeys(
  properties: Readonly<Record<string, string>>,
  marker: ActionMarker,
): string[] {
  return rankMarkerKeys(properties, marker)
    .slice(keptMarkerCount)
    .filter((key) => key !== marker.key);
}

// Whether the new marker is among the newest ten. A delayed action older than ten markers that the
// item holds already writes none, because its marker would be the one deleted.
export function isMarkerKept(
  properties: Readonly<Record<string, string>>,
  marker: ActionMarker,
): boolean {
  return rankMarkerKeys(properties, marker).indexOf(marker.key) < keptMarkerCount;
}

// The keys of the item's markers and the new one, the newest first.
function rankMarkerKeys(
  properties: Readonly<Record<string, string>>,
  marker: ActionMarker,
): string[] {
  const values = { ...properties, [marker.key]: marker.value };

  return Object.keys(values)
    .filter((key) => markerKeyPattern.test(key))
    .toSorted((left, right) => {
      const byValue = Number(values[right]) - Number(values[left]);

      return byValue === 0 ? left.localeCompare(right) : byValue;
    });
}

// Whether a missing marker proves that the action's write never landed: a write deletes the older
// markers beyond the kept count, so an item at the count may have lost this one.
export function isMarkerLossProvable(properties: Readonly<Record<string, string>>): boolean {
  return collectMarkerKeys(properties).length < keptMarkerCount;
}
