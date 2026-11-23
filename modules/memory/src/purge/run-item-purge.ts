import { removeRecordKey } from '@heynixie/log';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { runForgetCleanup } from '../forget/run-forget-cleanup';
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

  if (keyIDs === 'skip') {
    return 'skipped';
  }

  // The item's own forget owns its keys. Its cleanup runs to its end here, so record.forgotten
  // follows the key delete and checkpoint even when that forget stopped before them.
  if (keyIDs === 'forget') {
    await runForgetCleanup(parts, request.itemID);
    await writeEvidencePurged(parts, request);

    return 'skipped';
  }

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('memory.purge.closed', { kind: 'memory', id: request.itemID });
  }

  for (const keyID of keyIDs) {
    await removeRecordKey(parts.context.log, keyID);
  }

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('memory.purge.keys_removed', { kind: 'memory', id: request.itemID });
  }

  await writeEvidencePurged(parts, request);

  return 'purged';
}

// skip when there is nothing to purge, forget when the item's own forget owns its keys. Otherwise
// the keys that the closing record owes a delete.
async function runItemClose(
  parts: StoreParts,
  request: PurgeRequest,
): Promise<readonly string[] | 'skip' | 'forget'> {
  const db = parts.context.log.writer.db;

  const facts = await readPurgeFacts(db, request);

  return match(pickPurgePlan(facts))
    .with({ kind: 'skip' }, () => 'skip' as const)
    .with({ kind: 'forget' }, () => 'forget' as const)
    .with({ kind: 'finish' }, (finish) => readClosedKeyIDs(db, finish.closedSequence))
    .with({ kind: 'lapse' }, async () => {
      await writeLapseClose(parts, facts);

      return [facts.itemID];
    })
    .with({ kind: 'close' }, (close) => writeItemClose(parts, facts, close))
    .exhaustive();
}
