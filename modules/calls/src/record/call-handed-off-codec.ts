import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// One request that the speech layer passed to nixie's turn. The request is erasable.
export const callHandedOffCodec = defineRecordCodec(
  'call.handed_off',
  z.object({ callID: z.string(), handOffID: z.string() }),
);
