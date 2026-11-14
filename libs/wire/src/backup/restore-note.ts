import { z } from 'zod';

// restore-note.json, at the root of the staging folder. nixie writes it when a restore empties
// staging, and the backup job reads and removes it at its next publish.
export const restoreNoteSchema = z
  .strictObject({
    format: z.literal(1),
    restoredAt: z.int().nonnegative(),

    // null: the restored directory did not come from a published key snapshot
    keySnapshotID: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .nullable(),
  })
  .readonly();

export type RestoreNote = z.infer<typeof restoreNoteSchema>;
