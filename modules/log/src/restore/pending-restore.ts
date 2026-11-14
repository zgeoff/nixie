import { z } from 'zod';

// What a finished restore leaves in its marker for the server's next start to install.
export const pendingRestoreSchema = z.strictObject({
  version: z.literal(1),
  recoveryID: z.string(),
  restoredAt: z.number().int(),
  backupTakenAt: z.number().int(),
});

export type PendingRestore = z.infer<typeof pendingRestoreSchema>;
