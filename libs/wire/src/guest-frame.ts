import { z } from 'zod';

const sessionPointSchema = z.object({
  sessionID: z.uuid(),
  messageID: z.uuid(),
});

const tokenCountSchema = z.int().nonnegative();

const toolUseSchema = z.object({ id: z.string(), name: z.string() });

// one assistant message: its text, and the tools it asked for by the name the model sees
const assistantFrameSchema = z.object({
  type: z.literal('assistant'),
  messageID: z.uuid(),
  text: z.string(),
  toolUses: z.array(toolUseSchema),
});

// inbox messages that the model read, by their uuid
const readFrameSchema = z.object({
  type: z.literal('read'),
  uuids: z.array(z.uuid()),
});

const usageSchema = z.object({
  inputTokens: tokenCountSchema,
  outputTokens: tokenCountSchema,
  cacheReadTokens: tokenCountSchema,
  cacheWriteTokens: tokenCountSchema,
});

// a model turn ended at a result; boundary is the session's last chain entry, where the next turn
// resumes
const endedFrameSchema = z.object({
  type: z.literal('ended'),
  boundary: sessionPointSchema,
  subtype: z.string(),
  stopReason: z.string().nullable(),
  turns: z.int().nonnegative(),
  usage: usageSchema,
});

// the turn stopped without a result the host can commit
const failedFrameSchema = z.object({
  type: z.literal('failed'),
  reason: z.enum(['tools_not_connected', 'session_missing', 'error']),
  detail: z.string(),
});

// What the guest sends the host during a turn. The host never takes the model's identity from
// these frames: it records the model of the profile it sent.
export const guestFrameSchema = z.discriminatedUnion('type', [
  assistantFrameSchema,
  readFrameSchema,
  endedFrameSchema,
  failedFrameSchema,
]);

export type GuestFrame = z.infer<typeof guestFrameSchema>;
