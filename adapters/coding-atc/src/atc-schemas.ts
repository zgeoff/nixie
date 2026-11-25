import { z } from 'zod';

const sessionEntry = z.object({
  id: z.string(),
  name: z.string(),
  cwd: z.string(),
  state: z.string(),
  createdAt: z.number().exactOptional(),
  locator: z.object({ daemon: z.string(), targetID: z.string() }),
  lifecycle: z.object({ harness: z.string().exactOptional() }).exactOptional(),
});

const nullableText = z.string().nullable().exactOptional();
const pending = z.object({ message: z.string() }).nullable().exactOptional();

const transcriptTool = z.looseObject({
  name: z.string().exactOptional(),
  summary: z.string().exactOptional(),
});

const transcriptRow = z.object({
  role: z.string(),
  text: z.string(),
  tools: z.array(transcriptTool).exactOptional(),
});

const origin = z.object({ daemon: z.string(), incarnation: z.string(), cursor: z.string() });

const trailEvent = z.object({
  cursor: z.string(),
  at: z.number(),
  session: z.string(),
  kind: z.string(),
  detail: z.string().nullable(),
  message: z.string().exactOptional(),
  label: z.string().exactOptional(),
  text: z.string().exactOptional(),
  complete: z.boolean().exactOptional(),
  textError: z.string().exactOptional(),
  origin: origin.exactOptional(),
});

// The parts of atc-gateway's tool answers that the adapter reads. A key it does not read is dropped.
export const atcSchemas = {
  sessionEntry,
  sessionsList: z.object({ sessions: z.array(sessionEntry) }),
  sessionGet: z.object({
    session: sessionEntry,
    prompt: nullableText,
    pending,
    result: nullableText,
  }),
  transcriptPage: z.object({
    rows: z.array(transcriptRow),
    more: z.boolean().exactOptional(),
    cursor: z.string().exactOptional(),
  }),
  trailEvent,
  eventsPage: z.object({
    events: z.array(trailEvent),
    cursor: z.string(),
    more: z.boolean(),
    truncated: z.array(z.string()).exactOptional(),
  }),
  messageSent: z.object({ message: z.string() }),
  sessionStop: z.object({ stopped: z.boolean() }),
  anyAnswer: z.looseObject({}),
};
