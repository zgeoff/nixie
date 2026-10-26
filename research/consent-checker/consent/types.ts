import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import { spanSchema } from '../../../libs/contract/src/span-schema.ts';

const consentMessageSchema = z.object({
  sequence: z.int(),
  text: z.string(),
  spans: z.array(spanSchema),
});

export type ConsentMessage = z.infer<typeof consentMessageSchema>;

// A natural pair holds a call the model made in the turn the messages started. A swapped pair holds
// the same messages and a call from another turn.
const bucketSchema = z.enum(['natural', 'swapped']);

export type Bucket = z.infer<typeof bucketSchema>;

const consentCallSchema = z.object({ sequence: z.int(), tool: z.string(), input: z.unknown() });

export type ConsentCall = z.infer<typeof consentCallSchema>;

export const consentCaseSchema = z.object({
  caseID: z.string(),
  bucket: bucketSchema,
  stepSequence: z.int(),
  messages: z.array(consentMessageSchema),
  call: consentCallSchema,
});

export type ConsentCase = z.infer<typeof consentCaseSchema>;

// The run settings each check or label record keeps, so a rerun can refuse a file of another run.
export interface RecordSource {
  model: string;
  effort: string;
  promptSHA256: string;
}

export const checkRecordSchema = z.object({
  caseID: z.string(),
  bucket: bucketSchema,
  tool: z.string(),
  model: z.string(),
  effort: z.string(),
  promptSHA256: z.string(),
  verdict: z.enum(['asserted', 'not_asserted', 'unsure']),
  reason: z.string(),
  failure: z.string().nullable(),
  failureReason: z.string().optional(),
  costUSD: z.number(),
});

export type CheckRecord = z.infer<typeof checkRecordSchema>;

export interface Label {
  caseID: string;
  isAsked: boolean;
}

const labelVerdictSchema = z.enum(['asked', 'not_asked', 'unsure']);

// What the labeller answers for one turn: a verdict for each call, by the call's number in the
// labeller's input.
export const labellerOutputSchema = z.object({
  calls: z.array(z.object({ call: z.int(), reason: z.string(), label: labelVerdictSchema })),
});

export const labelRecordSchema = z.object({
  stepSequence: z.int(),
  model: z.string(),
  effort: z.string(),
  promptSHA256: z.string(),
  labels: z.array(z.object({ caseID: z.string(), label: labelVerdictSchema, reason: z.string() })),
  failure: z.string().nullable(),
  failureReason: z.string().optional(),
  costUSD: z.number(),
});

export type LabelRecord = z.infer<typeof labelRecordSchema>;

export interface Exchange {
  role: 'owner' | 'assistant';
  text: string;
}

// One labeller call: a turn's messages, the exchanges before it, and each natural pair's call.
export interface LabelTurn {
  stepSequence: number;
  earlier: Exchange[];
  messages: ConsentMessage[];
  calls: { caseID: string; tool: string; input: unknown }[];
}
