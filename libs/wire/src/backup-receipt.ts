import { z } from 'zod';

const snapshotIDSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const stepResultSchema = z.enum(['passed', 'failed', 'not-run']);

export const backupReceiptSchema = z
  .strictObject({
    format: z.literal(1),
    sequence: z.int().positive(),
    writtenAt: z.int().nonnegative(),
    status: z.enum(['published', 'failed']),
    dataSnapshotID: snapshotIDSchema.nullable(),
    keySnapshotID: snapshotIDSchema.nullable(),
    removedKeySnapshotIDs: z.array(snapshotIDSchema).readonly(),
    prune: stepResultSchema,
    check: stepResultSchema,
    failure: z.string().min(1).nullable(),
  })
  .readonly()
  .refine(
    (receipt) =>
      receipt.status === 'failed'
        ? receipt.failure !== null
        : receipt.failure === null &&
          receipt.dataSnapshotID !== null &&
          receipt.keySnapshotID !== null &&
          receipt.prune === 'passed' &&
          receipt.check === 'passed',
    {
      message:
        'a published receipt names both snapshots, a passed prune and check and no failure, and a failed one names its failure',
      path: ['status'],
    },
  );

export type BackupReceipt = z.infer<typeof backupReceiptSchema>;
