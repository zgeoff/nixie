import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { readRemovedSequences } from '../record/read-removed-sequences';
import type { EvidenceMessage } from '../view/memory-view';

export async function readEvidenceMessage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number,
): Promise<EvidenceMessage> {
  // A record whose forget began is shown as erased from the forget's first transaction, before its
  // key is deleted.
  const forgetting = await readRemovedSequences(log.writer.db, [sequence]);

  if (forgetting.has(sequence)) {
    return { status: 'shredded' };
  }

  const [entry] = await readRecords(log, {
    afterSequence: sequence - 1,
    beforeSequence: sequence + 1,
    limit: 1,
  });

  const erasable = entry?.record.erasable;

  if (erasable === undefined || erasable.status === 'none') {
    return { status: 'missing' };
  }

  if (erasable.status !== 'readable') {
    return { status: erasable.status };
  }

  const text = erasable.fields['text'];

  return typeof text === 'string' ? { status: 'readable', text } : { status: 'missing' };
}
