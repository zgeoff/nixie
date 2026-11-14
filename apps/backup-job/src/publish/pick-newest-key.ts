import type { PublishedSnapshot } from './backup-repository';

// A key snapshot with no publish number is dropped when another key snapshot names its set in
// legacy-set, because the first numbered publish replaced it.
export function pickNewestKey(keys: readonly PublishedSnapshot[]): PublishedSnapshot | null {
  const replacedSets = new Set(keys.map((key) => key.legacySet));

  const remaining = keys.filter(
    (key) => !(key.publish === null && key.set !== null && replacedSets.has(key.set)),
  );

  const [first, ...others] = remaining;

  if (first === undefined) {
    return null;
  }

  const isNumbered = remaining.every((key) => key.publish !== null);

  return others.reduce((newest, key) => (isNewer(key, newest, isNumbered) ? key : newest), first);
}

function isNewer(candidate: PublishedSnapshot, newest: PublishedSnapshot, isNumbered: boolean) {
  if (isNumbered && candidate.publish !== newest.publish) {
    return (candidate.publish ?? 0) > (newest.publish ?? 0);
  }

  return candidate.writtenAt > newest.writtenAt;
}
