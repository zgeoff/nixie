import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const placesRemovedCodec = defineRecordCodec(
  'places.removed',
  z.object({ placeID: z.string() }),
);
