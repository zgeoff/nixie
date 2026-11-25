import { deploymentReference } from '@heynixie/credentials';
import { z } from 'zod';

// The voice section. A config without it turns calls off. The price per minute, the voice and the
// fixed lines live in the `voice/` files of the definitions.
export const voiceConfigSchema = z.strictObject({
  provider: z.literal('gpt-live'),

  // the secrets entry that holds the speech provider's key
  credential: deploymentReference,
});

export type VoiceConfig = z.infer<typeof voiceConfigSchema>;
