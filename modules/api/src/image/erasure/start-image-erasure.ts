import { readImageForgetTargets } from '@heynixie/connectors';
import type { ErasureStart, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError, readErasures } from '@heynixie/log';
import { readRecordForgetCheck } from '../../record/read-record-forget-check';
import type { APIContext } from '../../types';
import { buildTransactionContext } from '../../utils/build-transaction-context';
import type { ImageErasureRequest } from './build-image-erasable';

// The start transaction of a forget of one image. It refuses an image that is unknown, one whose
// records cannot be forgotten, one whose forget is open, and one that a finished forget covered. It
// captures no key, because the records that hold the image hold every key.
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

  // A repeat forget of an image that is gone, with no record of it that an erasure has not covered,
  // has nothing to do: it starts no erasure, so the answer keeps the sequence of the first finish.
  const isErased = await probeEveryTargetErased(log, found.targets);

  if (erasures.length > 0 && isErased) {
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

async function probeEveryTargetErased(
  log: Parameters<typeof readErasures>[0],
  targets: readonly { readonly sequence: number }[],
): Promise<boolean> {
  for (const target of targets) {
    const own = await readErasures(log, { kind: 'record', targetID: String(target.sequence) });

    if (!own.some((erasure) => erasure.isFinished)) {
      return false;
    }
  }

  return true;
}
