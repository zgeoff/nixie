import { z } from 'zod';

const spanSchema = z
  .strictObject({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    source: z.enum(['typed', 'pasted', 'dropped', 'unknown']),
  })
  .readonly();

const pairSchema = z
  .strictObject({
    asserted: z.boolean(),
    bucket: z.string().min(1),
    memory: z.string().min(1),
    quote: z.string().min(1),
  })
  .readonly();

const messageSchema = z
  .strictObject({ text: z.string().min(1), spans: z.array(spanSchema).readonly() })
  .readonly();

const sampleSchema = z
  .strictObject({
    id: z.string().min(1),
    message: messageSchema,
    pairs: z.array(pairSchema).min(1).readonly(),
  })
  .readonly();

const corpusSchema = z.strictObject({ samples: z.array(sampleSchema).readonly() }).readonly();

export type CheckerCorpus = z.infer<typeof corpusSchema>;
export type CheckerSample = CheckerCorpus['samples'][number];
export type CheckerPair = z.infer<typeof pairSchema>;

// Loads the checker corpus: messages, each with the memories it does and does not assert, labelled
// before any model saw a case.
export async function loadCheckerCorpus(path: string): Promise<CheckerCorpus> {
  const json: unknown = await Bun.file(path).json();

  return corpusSchema.parse(json);
}
