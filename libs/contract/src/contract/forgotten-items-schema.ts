import { z } from 'zod';
import { forgetBackupSchema } from './forget-backup-schema';

export const forgottenItemsSchema = z.object({
  itemIDs: z.array(z.string()),
  backup: forgetBackupSchema,
});
