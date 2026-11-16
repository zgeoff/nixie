import { z } from 'zod';

const usedSchema = z.object({
  minutes: z.number(),
  turns: z.number(),
  tokens: z.number(),
  dollars: z.number(),
});

const startedSchema = z.object({
  phase: z.literal('started'),
  workerRunID: z.string(),
  shortID: z.string(),
  callID: z.string(),
  model: z.string(),
  tools: z.array(z.string()),
  limits: usedSchema,
  isTaskLimit: z.boolean(),
});

const turnSchema = z.object({
  phase: z.literal('turn'),
  workerRunID: z.string(),
  callID: z.string(),
  turn: z.number(),
  tokens: z.number(),
  dollars: z.number(),
  text: z.string().optional(),
});

const endedSchema = z.object({
  phase: z.literal('ended'),
  workerRunID: z.string(),
  callID: z.string(),
  outcome: z.string(),
  limit: z.string().optional(),
  used: usedSchema,
  detail: z.string().optional(),
});

export const workerViewSchema = z.discriminatedUnion('phase', [
  startedSchema,
  turnSchema,
  endedSchema,
]);
