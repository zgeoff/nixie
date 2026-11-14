import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The contact's name and destination sit in the record's erasable fields.
export const contactMarkedKnownCodec = defineRecordCodec(
  'policy.contact_marked_known',
  z.object({ contactID: z.string() }),
);
