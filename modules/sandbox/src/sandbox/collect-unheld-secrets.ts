export interface SecretNames {
  // every name nixie added to the broker, from the grant_started and granted records
  readonly added: readonly string[];

  // the names that a live sandbox's grants hold
  readonly live: readonly string[];

  // the names the config's host-held profiles give, which the broker's own holder owns
  readonly hostHeld: readonly string[];

  // the names a grant in flight has added and no sandbox holds yet
  readonly pending: readonly string[];
}

// The names nixie may remove from the broker: those it added that no live sandbox holds and no
// grant in flight is about to.
export function collectUnheldSecrets(names: SecretNames): readonly string[] {
  const kept = new Set([...names.live, ...names.hostHeld, ...names.pending]);

  return [...new Set(names.added)].filter((name) => !kept.has(name));
}
