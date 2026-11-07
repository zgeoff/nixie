import { z } from 'zod';

export const forgetBackupSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('off') }),
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('failed'), failure: z.string() }),
  z.object({ state: z.literal('complete') }),
]);
