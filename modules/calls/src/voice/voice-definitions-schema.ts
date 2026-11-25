import { z } from 'zod';
import type { VoiceDefinitions } from '../types';

export const voiceDefinitionsSchema = z.object({
  voice: z.string().min(1),
  holdAfterMs: z.int().positive(),
  pricePerMinuteMicros: z.int().positive().nullable(),
  lines: z.object({
    holding: z.string().min(1),
    reconnect: z.string().min(1),
    couldntFinish: z.string().min(1),
    budget: z.string().min(1),
  }),
});

// What a deployment gets from the files it has not written. It holds no price, so a call refuses
// until `voice/voice.yaml` sets one.
export const defaultVoiceDefinitions: VoiceDefinitions = {
  voice: 'marin',
  holdAfterMs: 1500,
  pricePerMinuteMicros: null,
  lines: {
    holding: 'One moment.',
    reconnect: 'I dropped out for a second.',
    couldntFinish: "I couldn't finish that one.",
    budget: 'The calls budget is used up for now, so I need to end this call.',
  },
};
