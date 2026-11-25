import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const callReconnectedCodec = defineRecordCodec(
  'call.reconnected',
  z.object({ callID: z.string(), cause: z.enum(['session_limit', 'dropped', 'restart']) }),
);
