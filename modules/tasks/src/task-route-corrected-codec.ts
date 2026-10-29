import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskRouteCorrectedCodec = defineRecordCodec(
  'task.route_corrected',
  z.object({ message: z.int(), from: z.string(), to: z.string() }),
);
