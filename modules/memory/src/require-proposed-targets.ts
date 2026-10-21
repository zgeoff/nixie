import type { Transaction } from 'kysely';
import type { ItemRequirement } from './require-item';
import { requireItem } from './require-item';
import type { MemoryTables } from './types';
import type { GatedWrite } from './write-memory-batch';
import type { StagedWrite } from './writer-types';

export async function requireProposedTargets(
  tx: Transaction<unknown>,
  writes: readonly GatedWrite[],
): Promise<void> {
  const db = tx.$extendTables<MemoryTables>();

  for (const gated of writes) {
    const requirement = buildTargetRequirement(gated.write);

    if (gated.verdict.outcome === 'propose' && requirement !== null) {
      await requireItem(db, requirement);
    }
  }
}

function buildTargetRequirement(write: StagedWrite): ItemRequirement | null {
  if (write.op === 'retire') {
    return { target: write.target, operation: 'retire', states: ['active'] };
  }

  if (write.target === null) {
    return null;
  }

  return { target: write.target, operation: 'edit', states: ['active', 'retired'] };
}
