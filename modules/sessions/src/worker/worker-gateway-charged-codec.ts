import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// One per worker run whose gateway count of dollars passed what the worker's own model calls
// priced. The dollars are the excess, which the calling task run's meter adds to the turn records.
export const workerGatewayChargedCodec = defineRecordCodec(
  'worker.gateway_charged',
  z.object({
    workerRunID: z.uuid(),
    callID: z.string(),
    taskRunID: z.string().exactOptional(),
    dollars: z.number().positive(),
  }),
);
