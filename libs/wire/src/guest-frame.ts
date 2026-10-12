import { z } from 'zod';

const sessionPointSchema = z
  .object({
    sessionID: z.uuid(),
    messageID: z.uuid(),
  })
  .readonly();

const tokenCountSchema = z.int().nonnegative();

const toolUseSchema = z.object({ id: z.string(), name: z.string() }).readonly();

// one assistant message: its text, and the tools it asked for by the name the model sees
const assistantFrameSchema = z
  .object({
    type: z.literal('assistant'),
    messageID: z.uuid(),
    text: z.string(),
    toolUses: z.array(toolUseSchema).readonly(),
  })
  .readonly();

// inbox messages that the model read, by their uuid
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

// a model turn ended at a result; boundary is the session's last chain entry, where the next turn
// resumes, and isError marks a result the model API's error ended, such as a refused request
const endedFrameSchema = z
  .object({
    type: z.literal('ended'),
    boundary: sessionPointSchema,
    subtype: z.string(),
    stopReason: z.string().nullable(),
    isError: z.boolean().optional(),
    turns: z.int().nonnegative(),
    usage: usageSchema,
  })
  .readonly();

// the SDK compacted the session: what started it, and the context's tokens before and after, with
// no summary text
const compactedFrameSchema = z
  .object({
    type: z.literal('compacted'),
    trigger: z.enum(['manual', 'auto']),
    preTokens: tokenCountSchema,
    postTokens: tokenCountSchema.nullable(),
  })
  .readonly();

// the guest removed its session state and checked that it is gone
const purgedFrameSchema = z.object({ type: z.literal('purged') }).readonly();

// the turn stopped without a result the host can commit
const failedFrameSchema = z
  .object({
    type: z.literal('failed'),
    reason: z.enum(['tools_not_connected', 'session_missing', 'error']),
    detail: z.string(),
  })
  .readonly();

// What the guest sends the host during a turn. The host never takes the model's identity from
// these frames: it records the model of the profile it sent.
export const guestFrameSchema = z.discriminatedUnion('type', [
  assistantFrameSchema,
  readFrameSchema,
  endedFrameSchema,
  compactedFrameSchema,
  failedFrameSchema,
  purgedFrameSchema,
]);

export type GuestFrame = z.infer<typeof guestFrameSchema>;
