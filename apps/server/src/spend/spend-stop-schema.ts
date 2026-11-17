import { z } from 'zod';

export const spendStopSchema = z.strictObject({
  // the gateway's control listener
  control: z.url({ protocol: /^https?$/u }),

  // a reference into the secrets file's settings
  token: z.string().regex(/^deployment:.+$/u, 'the token is deployment:<name>'),

  // the gateway's model listener, as the credential broker reaches it
  modelURL: z.url({ protocol: /^https?$/u }),
});

export type SpendStopConfig = z.infer<typeof spendStopSchema>;
