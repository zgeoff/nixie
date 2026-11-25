import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// One request that the speech layer passed to nixie's turn. The request is erasable. `shortID` is
// the hand-off's short ID, which the model reads.
export const callHandedOffCodec = defineRecordCodec(
  'call.handed_off',
  z.object({ callID: z.string(), handOffID: z.string(), shortID: z.string() }),
);
