import { forgetBackupSchema } from '@heynixie/contract';
import { z } from 'zod';

export const forgetReplySchemas = {
  item: z.object({ itemID: z.string(), pending: z.boolean(), backup: forgetBackupSchema }),
  bulk: z.object({
    deleted: z.array(z.string()),
    pending: z.array(z.string()),
    backup: forgetBackupSchema,
  }),
};
