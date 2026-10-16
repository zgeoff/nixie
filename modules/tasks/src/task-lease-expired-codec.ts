import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A running task whose lease recovery found expired.
export const taskLeaseExpiredCodec = defineRecordCodec(
  'task.lease_expired',
  z.object({ taskID: z.string() }),
);
