import { readImageForgetTargets } from '@heynixie/connectors';
import type { Erasable } from '@heynixie/log';
import type { APIContext } from '../../types';
import { buildTransactionContext } from '../../utils/build-transaction-context';
import { startImageErasure } from './start-image-erasure';

export interface ImageErasureRequest {
  // the short ID or the UUID of the image
  readonly image: string;
}

// The image's runner methods. An image has no key of its own: its bytes sit under the keys of the
// records that hold, name and quote it, so its children are those records, and it finishes after
// them.
export function buildImageErasable(context: APIContext): Erasable<ImageErasureRequest> {
  return {
    start: (tx, request) => startImageErasure(tx, context, request),

    // The readers of the gallery and of the image tools hide an image once erasure.started names it.
    hide: () => Promise.resolve(),
    readChildren: async (tx, target) => {
      const found = await readImageForgetTargets(
        buildTransactionContext(context, tx).log,
        target.targetID,
      );

      return (found?.targets ?? []).map((record) => ({
        kind: 'record',
        targetID: String(record.sequence),
        version: null,
      }));
    },
    toRequest: (target) => ({ image: target.targetID }),
    cleanIndexes: () => Promise.resolve(),
  };
}
