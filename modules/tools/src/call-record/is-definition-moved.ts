// The two versions a tool's definition carries: the pin of its form and the definitions snapshot
// that supplied its declaration. A tool of fixed code has neither.
export interface DefinitionVersion {
  readonly pinHash: string | undefined;
  readonly definitionsHash: string | undefined;
}

// Whether the tool a call loaded has moved since: its pin or its declaration's snapshot differs
// from the one the call loaded, or the snapshot in force is no longer the one that supplied the
// declaration, which the registry has yet to rebuild.
export function isDefinitionMoved(
  loaded: DefinitionVersion,
  current: DefinitionVersion,
  snapshotHash: string,
): boolean {
  return (
    current.pinHash !== loaded.pinHash ||
    current.definitionsHash !== loaded.definitionsHash ||
    (loaded.definitionsHash !== undefined && loaded.definitionsHash !== snapshotHash)
  );
}
