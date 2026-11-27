import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A site or mail domain's removal holds its place ID here, beside the key its add record holds in
// the open. The removal of an address, phone or handle holds the ID in the record's erasable
// fields, so a forget of the place leaves no record that links to it.
export const placesRemovedCodec = defineRecordCodec(
  'places.removed',
  z.object({ placeID: z.string().exactOptional() }),
);
