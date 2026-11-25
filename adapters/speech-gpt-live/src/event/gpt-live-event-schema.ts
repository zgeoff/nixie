import { z } from 'zod';

// The events of the sideband that the adapter reads, from OpenAI's GPT-Live event reference. Any
// other event, such as reflected audio, is ignored.

const eventID = z.string().optional();
const timeMs = z.number();
const expiry = z.union([z.number(), z.string()]);

const startedSchema = z.object({
  type: z.literal('session.started'),
  event_id: eventID,
  session: z.object({ expires_at: expiry.optional() }).optional(),
});

const inputSchema = z.object({
  type: z.literal('session.input_transcript.delta'),
  event_id: eventID,
  delta: z.string(),
  start_ms: timeMs,
  end_ms: timeMs,
});

const outputSchema = z.object({
  type: z.literal('session.output_transcript.delta'),
  event_id: eventID,
  delta: z.string(),
  start_ms: timeMs,
  end_ms: timeMs,
});

const delegationSchema = z.object({
  type: z.literal('session.delegation.created'),
  event_id: eventID,
  offset_ms: timeMs,
  delegation: z.object({ id: z.string() }),
});

const appendedSchema = z.object({
  type: z.literal('session.commentary.appended'),
  event_id: eventID,
  client_event_id: z.string().optional(),
  start_ms: timeMs,
  end_ms: timeMs,
});

const closedSchema = z.object({
  type: z.literal('session.closed'),
  event_id: eventID,
  reason: z.string().optional(),
});

const errorBodySchema = z.object({
  type: z.string().optional(),
  message: z.string().optional(),
  param: z.string().nullish(),
  client_event_id: z.string().nullish(),
});

const errorSchema = z.object({
  type: z.literal('error'),
  event_id: eventID,
  error: errorBodySchema,
});

export const gptLiveEventSchema = z.discriminatedUnion('type', [
  startedSchema,
  inputSchema,
  outputSchema,
  delegationSchema,
  appendedSchema,
  closedSchema,
  errorSchema,
]);

export type GPTLiveEvent = z.infer<typeof gptLiveEventSchema>;
