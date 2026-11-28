export interface ToolVersion {
  readonly pinHash: string | undefined;
  readonly definitionsHash: string | undefined;
}

// Whether a tool with versions has another pin or another declaration snapshot than the call loaded.
// A call to a tool with no version never moves.
export function isCallVersionMoved(loaded: ToolVersion, current: ToolVersion): boolean {
  return (
    loaded.pinHash !== undefined &&
    (loaded.pinHash !== current.pinHash || loaded.definitionsHash !== current.definitionsHash)
  );
}
