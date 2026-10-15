import { waitAtFaultPoint } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { memoryWriterTaskID } from './memory-writer-task-id';
import { planBatchVersion } from './plan-batch-version';
import { requireProposedTargets } from './require-proposed-targets';
import type { StoreParts } from './types';
import type { GatedWrite } from './write-memory-batch';
import type { WrittenVersion } from './write-version-in-transaction';
import { writeVersionInTransaction } from './write-version-in-transaction';

// Writes the version of each applied write a batch kept, inside the batch's transaction, once the
// item each kept proposal names still stands at the version the session read.
export async function writeAppliedVersions(
  parts: StoreParts,
  tx: Transaction<unknown>,
  kept: readonly GatedWrite[],
): Promise<readonly WrittenVersion[]> {
  const written: WrittenVersion[] = [];

  await requireProposedTargets(tx, kept);

  for (const gated of kept) {
    if (gated.verdict.outcome === 'apply') {
      // oxlint-disable-next-line no-await-in-loop -- each version reads the rows the one before wrote
      const version = await writeVersionInTransaction(
        parts,
        tx,
        planBatchVersion(gated.write, gated.verdict),
      );

      written.push(version);

      if (NIXIE_TEST_BUILD && written.length === 1) {
        // oxlint-disable-next-line no-await-in-loop -- the harness holds the first write only
        await waitAtFaultPoint('writer.publish.inside', { kind: 'task', id: memoryWriterTaskID });
      }
    }
  }

  return written;
}
