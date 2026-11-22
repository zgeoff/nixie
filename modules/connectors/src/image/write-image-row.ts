import type { Transaction } from 'kysely';
import type { ImageRow, ImageTables } from './image-tables';

// Stores the images row that names a tool_result record, in the transaction that writes the record.
export async function writeImageRow(tx: Transaction<unknown>, row: ImageRow): Promise<void> {
  await tx.$extendTables<ImageTables>().insertInto('images').values(row).execute();
}
