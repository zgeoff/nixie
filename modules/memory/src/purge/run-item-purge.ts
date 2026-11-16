import { removeRecordKey } from '@heynixie/log';
import { match } from 'ts-pattern';
import type { PurgeRequest, StoreParts } from '../types';
import { pickPurgePlan } from './pick-purge-plan';
import { readClosedKeyIDs } from './read-closed-key-ids';
import { readPurgeFacts } from './read-purge-facts';
import { writeEvidencePurged } from './write-evidence-purged';
import { writeItemClose } from './write-item-close';
import { writeLapseClose } from './write-lapse-close';

export type PurgeResult = 'purged' | 'skipped';

// Purges one item of a purge set: the closing commit under the delivery lock, then the key deletes
// and the last mark. Each step finds its own record, or a missing key, and writes nothing more when
// it runs again.
export async function runItemPurge(parts: StoreParts, request: PurgeRequest): Promise<PurgeResult> {
  const keyIDs = await parts.lock(() => runItemClose(parts, request));

  if (keyIDs === null) {
    return 'skipped';
  }

  for (const keyID of keyIDs) {
    await removeRecordKey(parts.context.log, keyID);
  }

  await writeEvidencePurged(parts, request);

  return 'purged';
}

// Null when there is nothing to purge. Otherwise the keys that the closing record owes a delete.
async function runItemClose(
  parts: StoreParts,
  request: PurgeRequest,
): Promise<readonly string[] | null> {
  const db = parts.context.log.writer.db;

  const facts = await readPurgeFacts(db, request);

  return match(pickPurgePlan(facts))
    .with({ kind: 'skip' }, () => null)
    .with({ kind: 'finish' }, (finish) => readClosedKeyIDs(db, finish.closedSequence))
    .with({ kind: 'lapse' }, async () => {
      await writeLapseClose(parts, facts);

      return [];
    })
    .with({ kind: 'close' }, (close) => writeItemClose(parts, facts, close))
    .exhaustive();
}
