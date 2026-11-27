import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { placeAddedByValues, trustLevels } from './types';

// A site or mail domain holds its domain, its subdomain flag and its name here. An address, phone
// or handle place holds only its kind: the key and the name sit in the record's erasable fields.
export const placesAddedCodec = defineRecordCodec(
  'places.added',
  z.object({
    placeID: z.string(),
    shortID: z.string(),
    kind: z.enum(['site', 'mail_domain', 'address', 'phone', 'handle']),
    trust: z.enum(trustLevels),
    addedBy: z.enum(placeAddedByValues),
    domain: z.string().exactOptional(),
    subdomains: z.boolean().exactOptional(),
    name: z.string().nullable().exactOptional(),
  }),
);
