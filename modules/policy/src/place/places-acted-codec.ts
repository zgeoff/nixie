import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A call that an act place allowed. It sits on the call's thread, and a replay writes none. The
// place's IDs sit here for a site or mail domain, and in the record's erasable fields for an
// address, phone or handle, as a removal's do.
export const placesActedCodec = defineRecordCodec(
  'places.acted',
  z.object({
    placeID: z.string().exactOptional(),
    shortID: z.string().exactOptional(),
    callID: z.string(),
    tool: z.string(),
  }),
);
