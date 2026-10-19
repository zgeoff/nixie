import { z } from 'zod';

const sessionPointSchema = z
  .object({
    sessionID: z.uuid(),
    messageID: z.uuid(),
  })
  .readonly();

const tokenCountSchema = z.int().nonnegative();
const toolUseSchema = z.object({ id: z.string(), name: z.string() }).readonly();

// one assistant message: its text, the tools it asked for by the name the model sees, and the
// reasoning summary the model gives under the summarized thinking display. The summary rides a
// thinking-only message, so it is absent on a message that carries only the reply's text.
const assistantFrameSchema = z
  .object({
    type: z.literal('assistant'),
    messageID: z.uuid(),
    text: z.string(),
    toolUses: z.array(toolUseSchema).readonly(),
    summary: z.string().optional(),
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

// the context the model read at the turn's last main-chain call, as input plus cache-read plus
// cache-write tokens, and the window the CLI compacts within
const contextSchema = z
  .object({
    size: tokenCountSchema,
    window: z.int().positive(),
  })
  .readonly();

// a model turn ended at a result; boundary is the session's last chain entry where the next turn
// resumes, isError marks an end a model API error caused, terminalReason is the SDK's end reason,
// context is absent when no main-chain call reported usage, and thinkingTokens is the turn's total
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

// the summary a summarize frame asked for: the model's text, the summary's own chain entry, where a
// request to cut it resumes, and the call's token counts
const summarizedFrameSchema = z
  .object({
    type: z.literal('summarized'),
    boundary: sessionPointSchema,
    text: z.string(),
    usage: usageSchema,
  })
  .readonly();

// the guest removed its session state and checked that it is gone
const purgedFrameSchema = z.object({ type: z.literal('purged') }).readonly();

// the turn stopped without a result the host can commit; model_auth means the model API refused
// the credential, so every retry fails the same way until the credential changes
const failedFrameSchema = z
  .object({
    type: z.literal('failed'),
    reason: z.enum(['tools_not_connected', 'session_missing', 'model_auth', 'error']),
    detail: z.string(),
  })
  .readonly();

// What the guest sends the host during a turn. The host never takes the model's identity from
// these frames: it records the model of the profile it sent.
export const guestFrameSchema = z.discriminatedUnion('type', [
  assistantFrameSchema,
  readFrameSchema,
  endedFrameSchema,
  summarizedFrameSchema,
  failedFrameSchema,
  purgedFrameSchema,
]);

export type GuestFrame = z.infer<typeof guestFrameSchema>;
