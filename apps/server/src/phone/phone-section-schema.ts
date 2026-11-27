import { deploymentReference } from '@heynixie/credentials';
import { phoneConfigSchema } from '@heynixie/phone';
import { z } from 'zod';
import { twilioConfigSchema } from './twilio-config-schema';

// The `phone` section: the phone module's keys and the provider's own section. Without it nixie has
// no phone. The number is the value or a reference to a settings entry.
export const phoneSectionSchema = phoneConfigSchema.extend({
  number: z.union([phoneConfigSchema.shape.number, deploymentReference]),
  twilio: twilioConfigSchema,
});
