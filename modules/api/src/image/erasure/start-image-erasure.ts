import { readImageForgetTargets } from '@heynixie/connectors';
import type { ErasureStart, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError, readErasures } from '@heynixie/log';
import { readRecordForgetCheck } from '../../record/read-record-forget-check';
import type { APIContext } from '../../types';
import { buildTransactionContext } from '../../utils/build-transaction-context';
import type { ImageErasureRequest } from './build-image-erasable';

// The start transaction of a forget of one image. It refuses an image that is unknown, one whose
// records cannot be forgotten, and one whose forget is open. It captures no key, because the
// records that hold the image hold every key.
export async function startImageErasure(
  tx: WriteTransaction,
  context: APIContext,
  request: ImageErasureRequest,
): Promise<ErasureStart> {
  const log = buildTransactionContext(context, tx).log;

  const found = await readImageForgetTargets(log, request.image);

  if (found === null) {
    throw new ErasureRefusedError('not_found');
  }

  const erasures = await readErasures(log, { kind: 'image', targetID: found.uuid });

  if (erasures.some((erasure) => !erasure.isFinished)) {
    throw new ErasureRefusedError('already_begun');
  }

  for (const target of found.targets) {
    const check = await readRecordForgetCheck(tx, target);

    if (check.status === 'action_not_finished') {
      throw new ErasureRefusedError('action_not_finished');
    }

    if (check.status !== 'ok') {
      throw new ErasureRefusedError('not_found');
    }
  }

  return {
    target: { kind: 'image', targetID: found.uuid, version: null },
    shortID: found.image,
    capture: {
      keys: { ids: [] },
      cleanupKeys: [],
      sandboxCallIDs: [],
      purges: [],
      sessionCause: { sessions: 'none' },
      turnInputs: { threads: 'none', cleaned: false, floor: null },
    },
  };
}
