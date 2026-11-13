import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const contactUnmarkedCodec = defineRecordCodec(
  'policy.contact_unmarked',
  z.object({ contactID: z.string() }),
);
