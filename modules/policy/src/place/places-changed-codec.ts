import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { trustLevels } from './types';

// The name of a site or mail domain place sits here. The name of any other place sits in the
// record's erasable fields.
export const placesChangedCodec = defineRecordCodec(
  'places.changed',
  z.object({
    placeID: z.string(),
    trust: z.enum(trustLevels).exactOptional(),
    name: z.string().nullable().exactOptional(),
  }),
);
