import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const callAnsweredCodec = defineRecordCodec(
  'call.answered',
  z.object({ callID: z.string(), carryingSession: z.string() }),
);
