import { oc } from '@orpc/contract';
import { z } from 'zod';

export const hostLogContract = {
  export: oc
    .errors({
      EXPORT_DENIED: { message: 'a rule in force denies the export', status: 403 },
      EXPORT_PATH_EXISTS: { message: 'a file or folder already holds that path', status: 409 },
      EXPORT_PATH_UNWRITABLE: { message: 'nixie cannot create a file at that path', status: 400 },
    })
    .input(z.strictObject({ path: z.string().min(1) }))
    .output(
      z.object({
        path: z.string(),
        records: z.int().nonnegative(),
        gaps: z.int().nonnegative(),
        exportedAt: z.date(),
      }),
    ),
};
