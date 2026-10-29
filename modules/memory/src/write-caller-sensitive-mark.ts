import type { SensitiveMarkRequest, WriteOutcome } from './gate-types';
import type { StoreParts } from './types';
import { writeSensitiveMark } from './write-sensitive-mark';

export async function writeCallerSensitiveMark(
  parts: StoreParts,
  request: SensitiveMarkRequest,
): Promise<WriteOutcome> {
  const caller = request.caller;

  const ref = await writeSensitiveMark(parts, {
    itemID: request.itemID,
    isSensitive: request.isSensitive,
    provenance: {
      origin: caller.origin,
      source: 'untrusted',
      taskID: caller.taskID,
      proposalID: null,
      checks: null,
      thread: caller.thread,
      model: caller.model,
    },
  });

  return { status: 'applied', ...ref };
}
