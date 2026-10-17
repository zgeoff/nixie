import type { Transaction } from 'kysely';
import type { ItemRequirement } from './require-item';
import { requireItem } from './require-item';
import type { MemoryTables } from './types';
import type { GatedWrite } from './write-memory-batch';
import type { StagedWrite } from './writer-types';

// Throws unless the item each proposal of a batch names still stands at the version the session
// read, in a state its approval accepts, as requireItem checks it. An applied write checks its item
// as it writes its version instead.
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

// the states each operation accepts, as the version its approval writes requires them
function buildTargetRequirement(write: StagedWrite): ItemRequirement | null {
  if (write.op === 'retire') {
    return { target: write.target, operation: 'retire', states: ['active'] };
  }

  if (write.target === null) {
    return null;
  }

  return { target: write.target, operation: 'edit', states: ['active', 'retired'] };
}
