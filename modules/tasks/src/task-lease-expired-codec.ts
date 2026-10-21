import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskLeaseExpiredCodec = defineRecordCodec(
  'task.lease_expired',
  z.object({ taskID: z.string() }),
);
