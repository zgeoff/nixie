import { withWriteTransaction } from '../record/with-write-transaction';
import { writeRecordsInTransaction } from '../record/write-records-in-transaction';
import { ErasureRefusedError } from './erasure-refused-error';
import { erasureStartedCodec } from './erasure-started-codec';
import type {
  Erasable,
  ErasureBegin,
  ErasureLogContext,
  ErasureParent,
  ErasureStartOptions,
} from './types';

export interface BeginOptions extends ErasureStartOptions {
  readonly parent?: ErasureParent;
}

// The start transaction: the caller's hook, the store's start, and erasure.started with the capture
// commit together or not at all. A refusal comes back as a value, and a store's own refusal error
// leaves nothing written, so a client action that the hook wrote rolls back.
export async function writeErasureStarted<Request>(
  context: ErasureLogContext,
  erasable: Erasable<Request>,
  request: Request,
  options: BeginOptions,
): Promise<ErasureBegin> {
  try {
    const begun = await withWriteTransaction(context.log.writer, async (tx) => {
      await options.writeInTransaction?.(tx);

      const start = await erasable.start(tx, request);

      const erasureID = crypto.randomUUID();

      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'erasure.started',
          definitions: context.definitions(),
          payload: erasureStartedCodec.encode({
            erasureID,
            kind: start.target.kind,
            targetID: start.target.targetID,
            shortID: start.shortID,
            version: start.target.version,
            parentID: options.parent?.erasureID ?? null,
            by: options.by,
            capture: start.capture,
          }),
        },
      ]);

      return { erasureID, target: start.target, shortID: start.shortID };
    });

    return { status: 'begun', ...begun };
  } catch (error) {
    if (error instanceof ErasureRefusedError) {
      return { status: 'refused', reason: error.reason };
    }

    throw error;
  }
}
