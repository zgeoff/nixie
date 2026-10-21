import { z } from 'zod';

const inboxImageSchema = z
  .object({
    marker: z.string(),
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    data: z.base64(),
  })
  .readonly();

export type InboxImage = z.infer<typeof inboxImageSchema>;

// The SDK stamps the uuid on each message the model read, so the host marks exactly those read.
const inboxMessageSchema = z
  .object({
    uuid: z.uuid(),
    text: z.string(),
    images: z.array(inboxImageSchema).readonly().optional(),
  })
  .readonly();

export type InboxMessage = z.infer<typeof inboxMessageSchema>;

// The guest never sees the profile's credential: the sandbox's grant injects it, and the guest holds
// a placeholder.
const turnProfileSchema = z
  .object({
    model: z.string().min(1),
    baseURL: z.url(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
    authHeader: z.enum(['bearer', 'x-api-key']),
    contextTokens: z.int().positive().nullable(),

    cacheTTL: z.enum(['5m', '1h']),
  })
  .readonly();

export type TurnProfile = z.infer<typeof turnProfileSchema>;

const sessionPointSchema = z
  .object({
    sessionID: z.uuid(),
    messageID: z.uuid(),
  })
  .readonly();

export type SessionPoint = z.infer<typeof sessionPointSchema>;

const toolRouteSchema = z.object({ url: z.url(), token: z.string().min(1) }).readonly();

const turnFrameSchema = z
  .object({
    type: z.literal('turn'),
    profile: turnProfileSchema,
    tools: toolRouteSchema,
    resume: sessionPointSchema.nullable(),
    systemPrompt: z.string(),
    input: z.array(inboxMessageSchema).min(1).readonly(),
  })
  .readonly();

const messageFrameSchema = z
  .object({
    type: z.literal('message'),
    message: inboxMessageSchema,
  })
  .readonly();

const summarizeFrameSchema = z
  .object({
    type: z.literal('summarize'),
    profile: turnProfileSchema,
    resume: sessionPointSchema,
    systemPrompt: z.string(),
    instruction: z.string().min(1),
  })
  .readonly();

const purgeFrameSchema = z.object({ type: z.literal('purge') }).readonly();

export const hostFrameSchema = z.discriminatedUnion('type', [
  turnFrameSchema,
  messageFrameSchema,
  summarizeFrameSchema,
  purgeFrameSchema,
]);

export type HostFrame = z.infer<typeof hostFrameSchema>;
