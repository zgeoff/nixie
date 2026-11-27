import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A call that an act place allowed. It sits on the call's thread, and a replay writes none.
export const placesActedCodec = defineRecordCodec(
  'places.acted',
  z.object({ placeID: z.string(), shortID: z.string(), callID: z.string(), tool: z.string() }),
);
