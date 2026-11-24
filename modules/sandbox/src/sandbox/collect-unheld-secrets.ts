export interface SecretNames {
  // every name nixie added to the broker, from its records
  readonly added: readonly string[];

  // the names that a live sandbox's grants hold
  readonly live: readonly string[];

  // the names the config's host-held profiles give, which the broker's own holder owns
  readonly hostHeld: readonly string[];
}

// The names nixie may remove from the broker: those it added that no live sandbox holds.
export function collectUnheldSecrets(names: SecretNames): readonly string[] {
  const kept = new Set([...names.live, ...names.hostHeld]);

  return [...new Set(names.added)].filter((name) => !kept.has(name));
}
