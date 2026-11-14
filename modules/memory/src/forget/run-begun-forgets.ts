import type { ForgetStatus, MemoryTables, StoreParts } from '../types';
import { readForgetStatus } from '../utils/read-forget-status';
import { runForgetCleanup } from '../utils/run-forget-cleanup';

export async function runBegunForgets(
  parts: StoreParts,
  itemIDs: readonly string[],
): Promise<ForgetStatus> {
  const db = parts.context.log.writer.db.$extendTables<MemoryTables>();

  const begun = await readForgetStatus(db, itemIDs);

  for (const itemID of begun.pending) {
    await runForgetCleanup(parts, itemID);
  }

  return readForgetStatus(db, itemIDs);
}
