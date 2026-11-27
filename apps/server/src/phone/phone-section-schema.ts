import { phoneConfigSchema } from '@heynixie/phone';
import { twilioConfigSchema } from './twilio-config-schema';

// The `phone` section: the phone module's keys and the provider's own section. Without it nixie has
// no phone.
export const phoneSectionSchema = phoneConfigSchema.extend({ twilio: twilioConfigSchema });
