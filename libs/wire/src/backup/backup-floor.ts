import { z } from 'zod';

// The highest set sequence that may no longer publish. nixie writes it in the transaction of each
// erasure.finished record, and the job reads it before it ships each set. Every set row of that
// moment sits at or below it, and every later set sits above.
export const backupFloorSchema = z.strictObject({
  format: z.literal(1),
  sequence: z.int().nonnegative(),
});

export type BackupFloor = z.infer<typeof backupFloorSchema>;
