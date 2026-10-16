import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { memoryRefsSchema } from './memory-refs-schema';
import { modelFieldsShape } from './model-fields-shape';

const mark = z.int().nonnegative();

// A turn's end: its model turns and token totals, the SDK's reasons for its end, the context its
// last call read with its window, the memory and past messages it ran with, the marks it read, and
// its session's images. A context no call reported, and a mark the turn did not reach, stay out.
export const modelTurnEndedCodec = defineRecordCodec(
  'model.turn_ended',
  z.object({
    ...modelFieldsShape,
    stopReason: z.string().nullable(),
    terminalReason: z.string().exactOptional(),
    turns: z.int(),
    inputTokens: z.int(),
    outputTokens: z.int(),
    cacheReadTokens: z.int(),
    cacheWriteTokens: z.int(),
    contextSize: z.int().nonnegative().exactOptional(),
    contextWindow: z.int().positive().exactOptional(),
    pinnedCore: memoryRefsSchema,
    retrieved: memoryRefsSchema,
    retrievedMessages: z.int().positive().array().exactOptional(),
    invalidatedThrough: mark,
    sessionImageBytes: mark,
    sessionImageCount: mark,
    recalledThrough: mark.exactOptional(),
    memoryNotedThrough: mark.exactOptional(),
  }),
);
