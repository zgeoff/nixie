import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const tokens = z.int().nonnegative();

// One per worker model call. The erasable field is { text }, which came from a model.
export const workerTurnEndedCodec = defineRecordCodec(
  'worker.turn_ended',
  z.object({
    workerRunID: z.uuid(),
    callID: z.string(),
    taskRunID: z.string().exactOptional(),
    model: z.string(),
    profile: z.string(),
    turn: z.int().positive(),
    inputTokens: tokens,
    outputTokens: tokens,
    cacheReadTokens: tokens,
    cacheWriteTokens: tokens,

    // priced on the worker's profile at the call
    dollars: z.number().nonnegative(),
  }),
);
