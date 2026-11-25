import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Marks how much of a reply the user heard before talking over it, in characters of the reply
// text that nixie sent the speech layer.
export const callHeardCutCodec = defineRecordCodec(
  'call.heard_cut',
  z.object({
    callID: z.string(),
    handOffID: z.string(),
    replyRecordID: z.string(),
    heardChars: z.int().nonnegative(),
  }),
);
