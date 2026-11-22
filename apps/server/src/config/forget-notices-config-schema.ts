import { z } from 'zod';

export interface ForgetNoticesConfig {
  readonly note: boolean;
}

// `forget_notices: false` turns every kind off, and each key turns one kind off or on.
export const forgetNoticesConfigSchema = z
  .union([z.literal(false), z.strictObject({ note: z.boolean().default(true) })])
  .transform((config): ForgetNoticesConfig => ({ note: config === false ? false : config.note }));
