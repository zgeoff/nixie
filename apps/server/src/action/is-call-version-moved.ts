import type { ToolVersion } from '@heynixie/actions';

// Whether a tool has another pin or another declaration snapshot than the one a decision covered.
// A decision on a tool with no version never moves.
export function isCallVersionMoved(loaded: ToolVersion, current: ToolVersion): boolean {
  return (
    loaded.pinHash !== undefined &&
    (loaded.pinHash !== current.pinHash || loaded.definitionsHash !== current.definitionsHash)
  );
}
