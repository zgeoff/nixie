import { waitAtFaultPoint } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { planBatchVersion } from '../batch/plan-batch-version';
import { requireProposedTargets } from '../memory/require-proposed-targets';
import type { GatedWrite } from '../memory/write-memory-batch';
import type { StoreParts } from '../types';
import { requireCheckerSnapshot } from '../utils/checker/require-checker-snapshot';
import { memoryWriterTaskID } from '../utils/memory-writer-task-id';
import type { WrittenVersion } from './write-version-in-transaction';
import { writeVersionInTransaction } from './write-version-in-transaction';

export async function writeAppliedVersions(
  parts: StoreParts,
  tx: Transaction<unknown>,
  kept: readonly GatedWrite[],
): Promise<readonly WrittenVersion[]> {
  const written: WrittenVersion[] = [];

  await requireProposedTargets(tx, kept);

  for (const gated of kept) {
    if (gated.verdict.outcome === 'apply') {
      requireCheckerSnapshot(parts.context, gated.verdict.checks);

      const version = await writeVersionInTransaction(
        parts,
        tx,
        planBatchVersion(gated.write, gated.verdict),
      );

      written.push(version);

      if (NIXIE_TEST_BUILD && written.length === 1) {
        await waitAtFaultPoint('writer.publish.inside', { kind: 'task', id: memoryWriterTaskID });
      }
    }
  }

  return written;
}
