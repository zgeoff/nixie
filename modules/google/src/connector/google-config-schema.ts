import { buildDurationSchema } from '@heynixie/clock';
import { z } from 'zod';
import { gmailConfigSchema } from '../gmail/gmail-config-schema';

// The `google` section of the deployment config. Google is on only when the section is there.
export const googleConfigSchema = z.strictObject({
  gmail: gmailConfigSchema.default(gmailConfigSchema.parse({})),

  // how long a connection stays broken before the model hears of it once more
  break_notice: buildDurationSchema('2d'),
});
