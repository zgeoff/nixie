import { readForgetStatus } from './read-forget-status';
import { runForgetCleanup } from './run-forget-cleanup';
import type { ForgetStatus, MemoryTables, StoreParts } from './types';

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
