import { makeRandom } from './make-random.ts';

// Holds out about half the labelled turns, so a setting chosen on the other half is scored on turns
// it was not chosen on. Each turn's half comes from its own ID and the seed alone, so adding or
// dropping a turn leaves every other turn in its half.
export function pickHeldOutCases(caseIDs: readonly string[], seed: number): Set<string> {
  return new Set(caseIDs.filter((caseID) => makeRandom(hashCaseID(caseID) ^ seed)() < 0.5));
}

// FNV-1a over the ID's UTF-16 code units, in 32-bit integer arithmetic.
function hashCaseID(caseID: string): number {
  let hash = 0x811c9dc5;

  for (let position = 0; position < caseID.length; position += 1) {
    hash = Math.imul(hash ^ caseID.charCodeAt(position), 0x01000193);
  }

  return hash >>> 0;
}
