// A runtime change conflicts once the definitions move its rule away from the version the change
// was made over, and it stays in force until you resolve the conflict.
export function isRuleConflict(baseHash: string | null, definitionsHash: string | null): boolean {
  return baseHash !== definitionsHash;
}
