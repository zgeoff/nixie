import { join } from 'node:path';
import { withWriteTransaction } from '@heynixie/log';
import {
  backupReceiptSchema,
  backupSetLayout,
  parseBackupFile,
  readBackupSets,
} from '@heynixie/wire';
import { requireBackupSetMove } from './backup-set-moves';
import { getBackupStagingDir } from './get-backup-staging-dir';
import type { BackupContext, BackupTables } from './types';

export type ReceivedReceipt =
  | {
      readonly sequence: number;
      readonly status: 'published' | 'failed';
      readonly failure: string | null;
    }
  | { readonly sequence: number; readonly refused: string };

// A set leaves staging once its receipt is recorded, so the staging directory holds only the sets
// the job has still to ship.
export async function writeReceivedReceipts(
  context: BackupContext,
): Promise<readonly ReceivedReceipt[]> {
  const stagingDir = getBackupStagingDir(context.writer.dataDir);

  const sets = await readBackupSets(stagingDir);

  const received: ReceivedReceipt[] = [];

  for (const set of sets.filter((entry) => entry.hasReceipt)) {
    const text = await Bun.file(join(set.directory, backupSetLayout.receipt)).text();
    const receipt = await writeReceipt(context, set.sequence, text);

    received.push(receipt);

    await context.storage.files.removeFile(set.directory);
  }

  if (received.length > 0) {
    await context.storage.files.writeDirectoryToDisk(stagingDir);
  }

  return received;
}

function writeReceipt(
  context: BackupContext,
  sequence: number,
  text: string,
): Promise<ReceivedReceipt> {
  const parsed = parseBackupFile(text, backupReceiptSchema);

  if ('refused' in parsed) {
    return writeRefusedReceipt(context, sequence, text, parsed.refused);
  }

  const receipt = parsed.value;

  if (receipt.sequence !== sequence) {
    return writeRefusedReceipt(
      context,
      sequence,
      text,
      `the receipt names set ${String(receipt.sequence)}, and it sits in the directory of set ${String(sequence)}`,
    );
  }

  return withWriteTransaction(context.writer, async (tx) => {
    const db = tx.$extendTables<BackupTables>();

    const row = await db
      .selectFrom('backup_sets')
      .select('state')
      .where('sequence', '=', sequence)
      .executeTakeFirst();

    if (row?.state !== 'staged') {
      return {
        sequence,
        refused: `nixie holds no staged set ${String(sequence)}, so the receipt answers no set it waits on`,
      };
    }

    requireBackupSetMove(row.state, receipt.status);

    await db
      .updateTable('backup_sets')
      .set({
        state: receipt.status,
        received_at: context.writer.clock.now(),
        data_snapshot_id: receipt.dataSnapshotID,
        key_snapshot_id: receipt.keySnapshotID,
        receipt: text,
      })
      .where('sequence', '=', sequence)
      .execute();

    return { sequence, status: receipt.status, failure: receipt.failure };
  });
}

// A set waiting on its receipt blocks every scheduled set, so a receipt nixie cannot read fails its
// set, and the row keeps the receipt's text.
async function writeRefusedReceipt(
  context: BackupContext,
  sequence: number,
  text: string,
  refused: string,
): Promise<ReceivedReceipt> {
  await withWriteTransaction(context.writer, async (tx) => {
    const db = tx.$extendTables<BackupTables>();

    await db
      .updateTable('backup_sets')
      .set({ state: 'failed', received_at: context.writer.clock.now(), receipt: text })
      .where('sequence', '=', sequence)
      .where('state', '=', 'staged')
      .execute();
  });

  return { sequence, refused };
}
