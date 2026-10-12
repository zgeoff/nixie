import { z } from 'zod';

const callSchema = z
  .strictObject({
    sample: z.string().min(1),
    pair: z.number().int().nonnegative(),
    repeat: z.number().int().nonnegative(),

    // the SHA-256 of the checker input the call sent
    input: z.string().startsWith('sha256:'),
    verdict: z.enum(['asserted', 'not_asserted', 'unsure']),
    reason: z.string(),

    // why the checker gave no verdict of its own, which reads as unsure
    failure: z.enum(['timeout', 'error', 'unreadable']).nullable(),
    costUSD: z.number().nonnegative(),
    latencyMs: z.number().nonnegative(),
  })
  .readonly();

const reportSchema = z
  .strictObject({
    model: z.string().min(1),
    effort: z.string().min(1),

    // the SHA-256 of the checker prompt the run used
    prompt: z.string().startsWith('sha256:'),
    repeats: z.number().int().positive(),
    calls: z.array(callSchema).readonly(),
  })
  .readonly();

export type CheckerReport = z.infer<typeof reportSchema>;
export type CheckerCall = z.infer<typeof callSchema>;

// Loads a committed checker eval report: the model, the prompt and each call's verdict.
export async function loadCheckerReport(path: string): Promise<CheckerReport> {
  const json: unknown = await Bun.file(path).json();

  return reportSchema.parse(json);
}
