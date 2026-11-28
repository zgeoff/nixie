import type { DefinitionsExportSweep } from '@heynixie/definitions';
import type { PlaceContext } from '@heynixie/policy';
import type { SeedParts } from '../seed/run-queued-seed';
import { makePlaceSeed } from './make-place-seed';

// The directory's write context, once the server parts exist: null before them. A write runs the
// in-force seed inside its own transaction.
export function readPlaceContext(
  parts: SeedParts | null,
  exports: DefinitionsExportSweep | null,
): PlaceContext | null {
  if (parts === null) {
    return null;
  }

  return {
    log: parts.context.log,
    definitions: parts.context.definitions,
    runInForce: makePlaceSeed(parts, exports),
  };
}
