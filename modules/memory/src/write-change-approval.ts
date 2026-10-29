import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type {
  ChangeAnswer,
  ConsolidationChangeRow,
  ConsolidationTables,
} from './consolidation-types';
import { parseChangeInputs } from './parse-change-inputs';
import { planChangeVersions } from './plan-change-versions';
import { requirePendingChange } from './require-pending-change';
import type { MemoryTables, StoreParts, VersionRef } from './types';
import { updateVersionIndex } from './update-version-index';
import { writeConsolidatorWakeInTransaction } from './write-consolidator-wake-in-transaction';
import type { WrittenVersion } from './write-version-in-transaction';
import { writeVersionInTransaction } from './write-version-in-transaction';

export async function writeChangeApproval(
  parts: StoreParts,
  answer: ChangeAnswer,
): Promise<readonly VersionRef[]> {
  const requirement = { changeID: answer.changeID, actionHash: answer.actionHash };

  const row = await requirePendingChange(
    parts.context.log.writer.db.$extendTables<ConsolidationTables>(),
    { ...requirement, now: parts.context.gate.clock.now() },
  );

  const plans = await planChangeVersions(parts, row, answer);

  return parts.lock(async () => {
    const written = await withWriteTransaction(parts.context.log.writer, async (tx) => {
      await requirePendingChange(tx.$extendTables<ConsolidationTables>(), {
        ...requirement,
        now: parts.context.gate.clock.now(),
      });

      const isSensitive = await probeSensitiveMerge(tx, row);

      const lead = plans.at(-1);
      const versions: WrittenVersion[] = [];

      for (const plan of plans) {
        const marked = isSensitive && plan === lead ? { ...plan, isSensitive: true } : plan;

        const version = await writeVersionInTransaction(parts, tx, marked);

        versions.push(version);
      }

      await writeConsolidatorWakeInTransaction(tx, parts);

      return versions;
    });

    for (const version of written) {
      await updateVersionIndex(parts, version.ref.itemID, version.next);
    }

    const refs = written.map((version) => version.ref);

    return [...refs.slice(-1), ...refs.slice(0, -1)];
  });
}

async function probeSensitiveMerge(
  tx: Transaction<unknown>,
  row: ConsolidationChangeRow,
): Promise<boolean> {
  const [, ...merged] = parseChangeInputs(row.inputs);

  if (merged.length === 0) {
    return false;
  }

  const sensitive = await tx
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where(
      'item_id',
      'in',
      merged.map((input) => input.itemID),
    )
    .where('is_sensitive', '=', 1)
    .executeTakeFirst();

  return sensitive !== undefined;
}
