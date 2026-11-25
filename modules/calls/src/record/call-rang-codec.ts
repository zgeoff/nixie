import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The ring's reason is erasable free text, and sits in the record's erasable fields.
export const callRangCodec = defineRecordCodec(
  'call.rang',
  z.object({ callID: z.string(), deviceCount: z.int().nonnegative() }),
);
