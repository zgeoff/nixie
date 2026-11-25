import { defineRecordCodec } from '@heynixie/log';
import { turnOutcomeSchema } from '@heynixie/wire';
import { z } from 'zod';
import { memoryRefsSchema } from './memory-refs-schema';
import { modelFieldsShape } from './model-fields-shape';

const mark = z.int().nonnegative();

export const modelTurnEndedCodec = defineRecordCodec(
  'model.turn_ended',
  z.object({
    ...modelFieldsShape,
    outcome: turnOutcomeSchema.exactOptional(),
    stopReason: z.string().nullable(),
    terminalReason: z.string().exactOptional(),
    turns: z.int(),
    inputTokens: z.int(),
    outputTokens: z.int(),
    cacheReadTokens: z.int(),
    cacheWriteTokens: z.int(),

    // The dollars of the tokens at the prices in force when the record was written, so a later
    // change of prices never reprices it. Absent for a profile with no prices.
    dollars: z.number().nonnegative().exactOptional(),

    thinkingTokens: z.int().nonnegative().exactOptional(),
    cutCalls: z.int().positive().exactOptional(),
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
    isSilent: z.literal(true).exactOptional(),
    isInterrupted: z.literal(true).exactOptional(),
  }),
);
