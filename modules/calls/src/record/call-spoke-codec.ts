import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A line of the speech layer's own small talk. The text is erasable. `lineID` is the line's short
// ID, which the model reads.
export const callSpokeCodec = defineRecordCodec(
  'call.spoke',
  z.object({
    callID: z.string(),
    lineID: z.string(),
    speaker: z.literal('speech_layer'),
    model: z.string(),

    // how many characters of the line the user heard
    heardChars: z.int().nonnegative(),
  }),
);
