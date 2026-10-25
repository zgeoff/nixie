import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import { spanSchema } from '../../../libs/contract/src/span-schema.ts';

const consentMessageSchema = z.object({ text: z.string(), spans: z.array(spanSchema) });

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
  costUSD: z.number(),
});

export type CheckRecord = z.infer<typeof checkRecordSchema>;

export const labelSchema = z.object({ caseID: z.string(), isAsked: z.boolean() });

export type Label = z.infer<typeof labelSchema>;
