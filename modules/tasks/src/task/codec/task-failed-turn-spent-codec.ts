import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskFailedTurnSpentCodec = defineRecordCodec(
  'task.failed_turn_spent',
  z.object({
    taskID: z.string(),
    dollars: z.number(),
    taskRunID: z.string().exactOptional(),

    // set when a commit carries the tally beside the turn's own record, which the tally replaces
    besideTurnRecord: z.literal(true).exactOptional(),
  }),
);
