import { z } from 'zod';

// One image of your message as the model reads it: the marker that names it in the message, which
// goes just before it, and its bytes in base64 under the type the server found in them.
const inboxImageSchema = z
  .object({
    marker: z.string(),
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    data: z.base64(),
  })
  .readonly();

export type InboxImage = z.infer<typeof inboxImageSchema>;

// One inbox record as the model reads it. The uuid stands for the record, and the SDK stamps it on
// what the model read, so the host marks exactly those records read.
const inboxMessageSchema = z
  .object({
    uuid: z.uuid(),
    text: z.string(),
    images: z.array(inboxImageSchema).readonly().optional(),
  })
  .readonly();

export type InboxMessage = z.infer<typeof inboxMessageSchema>;

// The model profile in force for the turn. The guest never sees the profile's credential: the
// sandbox's grant injects it, and the guest holds a placeholder.
const turnProfileSchema = z
  .object({
    model: z.string().min(1),
    baseURL: z.url(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
    authHeader: z.enum(['bearer', 'x-api-key']),
    contextTokens: z.int().positive().nullable(),
  })
  .readonly();

export type TurnProfile = z.infer<typeof turnProfileSchema>;

// A point in the SDK session: its ID and one chain entry in it.
const sessionPointSchema = z
  .object({
    sessionID: z.uuid(),
    messageID: z.uuid(),
  })
  .readonly();

export type SessionPoint = z.infer<typeof sessionPointSchema>;

// the base URL of the run's tool endpoint on the guest's loopback, and its bearer token
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

// asks for a summary of the session at the resume point, on a fork, in one model call with no
// tools: the instruction goes in as the call's one user message
const summarizeFrameSchema = z
  .object({
    type: z.literal('summarize'),
    profile: turnProfileSchema,
    resume: sessionPointSchema,
    systemPrompt: z.string(),
    instruction: z.string().min(1),
  })
  .readonly();

// removes the guest's session state, every transcript and fork, once a forget invalidated it
const purgeFrameSchema = z.object({ type: z.literal('purge') }).readonly();

// What the host sends the conversation guest: a turn, which resumes at the session boundary when
// there is one, a message for the running turn's next tool boundary, or in a turn's place a summary
// of the session or a purge of its state.
export const hostFrameSchema = z.discriminatedUnion('type', [
  turnFrameSchema,
  messageFrameSchema,
  summarizeFrameSchema,
  purgeFrameSchema,
]);

export type HostFrame = z.infer<typeof hostFrameSchema>;
