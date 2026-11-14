import type { MemoryTables } from '../types';
import type { TestMemory } from './start-test-memory';

// The checks that each applied version of an item recorded, oldest first.
export async function readVersionChecks(
  memory: Pick<TestMemory, 'writer'>,
  itemID: string,
): Promise<readonly unknown[]> {
  const rows = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select('checks')
    .where('item_id', '=', itemID)
    .orderBy('version')
    .execute();

  return rows.map((row): unknown => (row.checks === null ? null : JSON.parse(row.checks)));
}
