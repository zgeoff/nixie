import { readSourceEvidence } from '../evidence/read-source-evidence';
import type { WriteSource } from '../gate/gate-context';
import type { StoreParts } from '../types';
import type { SourceMessage } from '../writer/writer-model';

// A batch write of the memory writer is `owner` when its quote lies in the owner's typed words of
// the one message it cites.
export async function readBatchSources(
  parts: StoreParts,
  source: SourceMessage,
  quote: string,
): Promise<WriteSource> {
  const found = await readSourceEvidence(parts.context.log, source, quote);

  return found.status === 'found' ? 'owner' : 'outside';
}
