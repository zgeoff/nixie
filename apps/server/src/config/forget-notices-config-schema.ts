import { z } from 'zod';

export interface ForgetNoticesConfig {
  readonly note: boolean;
  readonly memory: boolean;
  readonly moment: boolean;
  readonly message: boolean;
}

// `forget_notices: false` turns every kind off, and each key turns one kind off or on.
export const forgetNoticesConfigSchema = z
  .union([
    z.literal(false),
    z.strictObject({
      note: z.boolean().default(true),
      memory: z.boolean().default(true),
      moment: z.boolean().default(true),
      message: z.boolean().default(true),
    }),
  ])
  .transform((config): ForgetNoticesConfig =>
    config === false ? { note: false, memory: false, moment: false, message: false } : config,
  );
