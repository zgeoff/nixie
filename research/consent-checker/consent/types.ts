// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import { spanSchema } from '../../../libs/contract/src/span-schema.ts';

// The failure of an answer that held no output, such as a call the model API refused. Its record
// keeps the call's cost, so the spend stays right, and a rerun runs the item again.
export const noOutputFailure = 'no_output';

// The reason a record with no answer gives when the query returned an answer with nothing in it.
export const emptyAnswerReason = 'the answer held no output';

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
  inputSHA256: z.string(),
  verdict: z.enum(['asserted', 'not_asserted', 'unsure']),
  reason: z.string(),
  failure: z.string().nullable(),
  failureReason: z.string().optional(),
  costUSD: z.number().nullable(),
});

export type CheckRecord = z.infer<typeof checkRecordSchema>;

// The line a run appends before each paid call, which holds at least the most that call can cost.
export const reservationSchema = z.object({
  reservedFor: z.string(),
  reserveUSD: z.number().positive(),
});

export type Reservation = z.infer<typeof reservationSchema>;

// The line a resumed run appends for a reservation that no record settled, which settles it at its
// reserved amount before the run reserves the item again.
export const settlementSchema = z.object({
  settledFor: z.string(),
  settledUSD: z.number().positive(),
});

export type Settlement = z.infer<typeof settlementSchema>;

// The limits each paid query runs under, so a reservation can hold the most the query can cost. The
// recorded run kept only the cost each query reported, so these are chosen, not measured.
export const queryLimits = {
  requestCap: 3,
  maxOutputTokens: 32_000,
  overheadBytes: 16_384,
};

export const checkLineSchema = z.union([reservationSchema, settlementSchema, checkRecordSchema]);

export type CheckLine = z.infer<typeof checkLineSchema>;

export interface Label {
  caseID: string;
  isAsked: boolean;
}

const labelVerdictSchema = z.enum(['asked', 'not_asked', 'unsure']);

const labelAnswerSchema = z.object({
  call: z.int(),
  reason: z.string(),
  label: labelVerdictSchema,
});

// What the labeller answers for one turn: a verdict for each call, by the call's number in the
// labeller's input.
export const labellerOutputSchema = z.object({ calls: z.array(labelAnswerSchema) });

const labelEntrySchema = z.object({
  caseID: z.string(),
  label: labelVerdictSchema,
  reason: z.string(),
});

export const labelRecordSchema = z.object({
  stepSequence: z.int(),
  model: z.string(),
  effort: z.string(),
  promptSHA256: z.string(),
  inputSHA256: z.string(),
  labels: z.array(labelEntrySchema),
  failure: z.string().nullable(),
  failureReason: z.string().optional(),
  costUSD: z.number().nullable(),
});

export type LabelRecord = z.infer<typeof labelRecordSchema>;

export const labelLineSchema = z.union([reservationSchema, settlementSchema, labelRecordSchema]);

export type LabelLine = z.infer<typeof labelLineSchema>;

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
