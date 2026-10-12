import { z } from 'zod';

// One inbox record as the model reads it. The uuid stands for the record, and the SDK stamps it on
// what the model read, so the host marks exactly those records read.
const inboxMessageSchema = z
  .object({
    uuid: z.uuid(),
    text: z.string(),
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

// removes the guest's session state, every transcript and fork, once a forget invalidated it
const purgeFrameSchema = z.object({ type: z.literal('purge') }).readonly();

// What the host sends the conversation guest. A turn starts one model turn, which resumes at the
// session boundary when there is one. A message reaches the running turn at its next tool boundary.
// A purge, sent in place of a turn, removes the session state and runs no model.
export const hostFrameSchema = z.discriminatedUnion('type', [
  turnFrameSchema,
  messageFrameSchema,
  purgeFrameSchema,
]);

export type HostFrame = z.infer<typeof hostFrameSchema>;
