import { voiceDefinitionsSchema } from '@heynixie/calls';
import { z } from 'zod';

export const storedVoiceSchema = z.looseObject({
  voice: voiceDefinitionsSchema.nullable().default(null),
});
