import { join } from 'node:path';
import { withWriteTransaction } from '@heynixie/log';
import {
  backupReceiptSchema,
  backupSetLayout,
  parseBackupFile,
  readBackupSets,
} from '@heynixie/wire';
import type { Transaction } from 'kysely';
import { getBackupStagingDir } from './get-backup-staging-dir';
import type { BackupContext, BackupSetState, BackupTables } from './types';
import type { BackupSetReceiptFields } from './write-backup-set-state';
import { writeBackupSetState } from './write-backup-set-state';

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
  const files = context.storage.files;

  const sets = await readBackupSets(files, stagingDir);

  const received: ReceivedReceipt[] = [];

  for (const set of sets.filter((entry) => entry.hasReceipt)) {
    const text = await files.readText(join(set.directory, backupSetLayout.receipt));
    const receipt = await writeReceipt(context, set.sequence, text);

    received.push(receipt);

    await files.removeFile(set.directory);
  }

  if (received.length > 0) {
    await files.writeDirectoryToDisk(stagingDir);
  }

  return received;
}

async function writeReceipt(
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

  const isWaiting = await withWriteTransaction(context.writer, (tx) =>
    writeWaitingSetState(tx, sequence, receipt.status, {
      received_at: context.writer.clock.now(),
      data_snapshot_id: receipt.dataSnapshotID,
      key_snapshot_id: receipt.keySnapshotID,
      receipt: text,
    }),
  );

  if (!isWaiting) {
    return {
      sequence,
      refused: `nixie holds no staged set ${String(sequence)}, so the receipt answers no set it waits on`,
    };
  }

  return { sequence, status: receipt.status, failure: receipt.failure };
}

// A set waiting on its receipt blocks every scheduled set, so a receipt nixie cannot read fails its
// set, and the row keeps the receipt's text.
async function writeRefusedReceipt(
  context: BackupContext,
  sequence: number,
  text: string,
  refused: string,
): Promise<ReceivedReceipt> {
  await withWriteTransaction(context.writer, (tx) =>
    writeWaitingSetState(tx, sequence, 'failed', {
      received_at: context.writer.clock.now(),
      data_snapshot_id: null,
      key_snapshot_id: null,
      receipt: text,
    }),
  );

  return { sequence, refused };
}

async function writeWaitingSetState(
  tx: Transaction<unknown>,
  sequence: number,
  state: BackupSetState,
  fields: BackupSetReceiptFields,
): Promise<boolean> {
  const row = await tx
    .$extendTables<BackupTables>()
    .selectFrom('backup_sets')
    .select('state')
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  if (row?.state !== 'staging' && row?.state !== 'staged') {
    return false;
  }

  // A row stays in staging when a step after the marker fails, and the job ships only a marked set,
  // so a receipt for a staging row reconciles it to staged first, as a restart would.
  if (row.state === 'staging') {
    await writeBackupSetState(tx, sequence, 'staged');
  }

  await writeBackupSetState(tx, sequence, state, fields);

  return true;
}
