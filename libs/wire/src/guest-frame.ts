import { z } from 'zod';
import { sessionPointSchema } from './session-point';

const tokenCountSchema = z.int().nonnegative();
const toolUseSchema = z.object({ id: z.string(), name: z.string() }).readonly();

// The SDK sends the reasoning summary on a thinking-only message, so a message that holds only the
// reply's text has no summary.
const assistantFrameSchema = z
  .object({
    type: z.literal('assistant'),
    messageID: z.uuid(),
    text: z.string(),
    toolUses: z.array(toolUseSchema).readonly(),
    summary: z.string().optional(),
  })
  .readonly();

const readFrameSchema = z
  .object({
    type: z.literal('read'),
    uuids: z.array(z.uuid()).readonly(),
  })
  .readonly();

const usageSchema = z
  .object({
    inputTokens: tokenCountSchema,
    outputTokens: tokenCountSchema,
    cacheReadTokens: tokenCountSchema,
    cacheWriteTokens: tokenCountSchema,
  })
  .readonly();

const contextSchema = z
  .object({
    size: tokenCountSchema,
    window: z.int().positive(),
  })
  .readonly();

const endedFrameSchema = z
  .object({
    type: z.literal('ended'),
    boundary: sessionPointSchema,
    subtype: z.string(),
    stopReason: z.string().nullable(),
    isError: z.boolean().optional(),
    terminalReason: z.string().optional(),
    turns: z.int().nonnegative(),
    usage: usageSchema,
    thinkingTokens: tokenCountSchema.optional(),
    context: contextSchema.optional(),
  })
  .readonly();

const summarizedFrameSchema = z
  .object({
    type: z.literal('summarized'),
    boundary: sessionPointSchema,
    text: z.string(),
    usage: usageSchema,
  })
  .readonly();

const purgedFrameSchema = z.object({ type: z.literal('purged') }).readonly();

// A model_auth failure means the model API refused the credential, so every retry fails the same
// way until the credential changes.
const turnFailedFrameSchema = z
  .object({
    type: z.literal('failed'),
    reason: z.enum(['tools_not_connected', 'session_missing', 'model_auth', 'error']),
    detail: z.string(),
  })
  .readonly();

// A quota is a rate limit whose wait the model API set too long for the CLI to retry within the
// call.
const modelAPIErrorSchema = z.enum([
  'rate_limit',
  'quota',
  'overloaded',
  'server_error',
  'billing',
  'account',
  'model_not_found',
  'unknown',
]);

export type ModelAPIErrorKind = z.infer<typeof modelAPIErrorSchema>;

const modelAPIFailedFrameSchema = z
  .object({
    type: z.literal('failed'),
    reason: z.literal('model_api'),
    error: modelAPIErrorSchema,
    detail: z.string(),
  })
  .readonly();

const failedFrameSchema = z.discriminatedUnion('reason', [
  turnFailedFrameSchema,
  modelAPIFailedFrameSchema,
]);

export const guestFrameSchema = z.discriminatedUnion('type', [
  assistantFrameSchema,
  readFrameSchema,
  endedFrameSchema,
  summarizedFrameSchema,
  failedFrameSchema,
  purgedFrameSchema,
]);

export type GuestFrame = z.infer<typeof guestFrameSchema>;
