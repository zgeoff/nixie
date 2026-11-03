import { z } from 'zod';

const callSchema = z
  .strictObject({
    sample: z.string().min(1),
    pair: z.number().int().nonnegative(),
    repeat: z.number().int().nonnegative(),

    input: z.string().startsWith('sha256:'),
    verdict: z.enum(['asserted', 'not_asserted', 'unsure']),
    reason: z.string(),

    failure: z.enum(['timeout', 'error', 'unreadable']).nullable(),
    costUSD: z.number().nonnegative(),
    latencyMs: z.number().nonnegative(),
  })
  .readonly();

const reportSchema = z
  .strictObject({
    model: z.string().min(1),
    effort: z.string().min(1),

    prompt: z.string().startsWith('sha256:'),

    ownerName: z.string().min(1).nullable(),
    repeats: z.number().int().positive(),
    calls: z.array(callSchema).readonly(),
  })
  .readonly();

export type CheckerReport = z.infer<typeof reportSchema>;

export type CheckerCall = z.infer<typeof callSchema>;

export async function loadCheckerReport(path: string): Promise<CheckerReport> {
  const json: unknown = await Bun.file(path).json();

  return reportSchema.parse(json);
}
