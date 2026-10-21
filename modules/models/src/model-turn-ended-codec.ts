import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { memoryRefsSchema } from './memory-refs-schema';
import { modelFieldsShape } from './model-fields-shape';

const mark = z.int().nonnegative();

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
