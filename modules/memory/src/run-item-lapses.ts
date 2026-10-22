import { waitAtFaultPoint } from '@heynixie/tasks';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { StaleVersionError } from './stale-version-error';
import type { MemoryTables, StoreParts, VersionRef } from './types';
import { writeRetirement } from './write-retirement';

export async function runItemLapses(parts: StoreParts): Promise<number> {
  const due = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'version'])
    .where('state', '=', 'active')
    .where('until', '<=', parts.context.gate.clock.now())
    .orderBy('until')
    .execute();

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: null });
  }

  let lapsed = 0;

  for (const row of due) {
    const isLapsed = await tryWriteLapse(parts, { itemID: row.item_id, version: row.version });

    if (isLapsed) {
      lapsed += 1;
    }
  }

  return lapsed;
}

async function tryWriteLapse(parts: StoreParts, target: VersionRef): Promise<boolean> {
  try {
    await writeRetirement(parts, {
      target,
      provenance: {
        origin: 'lapse',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    });

    return true;
  } catch (error) {
    // A write between the read and the retirement changed the item, so the next sweep reads it again.
    if (
      error instanceof StaleVersionError ||
      error instanceof MemoryStateError ||
      error instanceof MemoryItemNotFoundError
    ) {
      return false;
    }

    throw error;
  }
}
