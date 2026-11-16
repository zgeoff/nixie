import { z } from 'zod';
import { sessionPointSchema } from './session-point';

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
export const agentSDKTurnProfileSchema = z
  .object({
    harness: z.literal('agent-sdk'),
    model: z.string().min(1),
    baseURL: z.url(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
    authHeader: z.enum(['bearer', 'x-api-key']),
    contextTokens: z.int().positive().nullable(),

    cacheTTL: z.enum(['5m', '1h']),

    // non-null for a model outside Claude: the guest rewrites each request, and a provider pin makes
    // it carry a provider order
    requestRewrite: z.object({ providerPin: z.string().nullable() }).nullable().default(null),
  })
  .readonly();

// The reasoning efforts that the pinned Codex CLI's bundled catalog lists. The CLI's protocol types
// name an effort as an open string, so the codex guest's unit test checks this list instead.
export const codexEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

const codexTurnProfileSchema = z
  .object({
    harness: z.literal('codex'),
    model: z.string().min(1),
    baseURL: z.url(),
    effort: z.enum(codexEfforts),
  })
  .readonly();

export type AgentSDKTurnProfile = z.infer<typeof agentSDKTurnProfileSchema>;

export const turnProfileSchema = z.discriminatedUnion('harness', [
  agentSDKTurnProfileSchema,
  codexTurnProfileSchema,
]);

export type TurnProfile = z.infer<typeof turnProfileSchema>;

const toolRouteSchema = z.object({ url: z.url(), token: z.string().min(1) }).readonly();

// The guest stops a turn after this many model API calls, or runs it to its end at null. It sets
// the runtime's wait for one tool call to toolCallWaitMs milliseconds, or leaves the runtime's own
// timeout at null.
const turnLimitsSchema = z
  .object({
    modelCalls: z.int().positive().nullable(),
    toolCallWaitMs: z.int().positive().nullable(),
  })
  .readonly();

const turnFrameSchema = z
  .object({
    type: z.literal('turn'),
    profile: turnProfileSchema,
    tools: toolRouteSchema,
    resume: sessionPointSchema.nullable().optional(),
    systemPrompt: z.string(),
    input: z.array(inboxMessageSchema).min(1).readonly(),
    limits: turnLimitsSchema,
  })
  .readonly();

const messageFrameSchema = z
  .object({
    type: z.literal('message'),
    message: inboxMessageSchema,
  })
  .readonly();

const interruptFrameSchema = z.object({ type: z.literal('interrupt') }).readonly();

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
  interruptFrameSchema,
  summarizeFrameSchema,
  purgeFrameSchema,
]);

export type HostFrame = z.infer<typeof hostFrameSchema>;
