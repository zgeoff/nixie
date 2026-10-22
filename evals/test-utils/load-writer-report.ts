import { z } from 'zod';

const writeSchema = z
  .strictObject({
    op: z.enum(['remember', 'retire']),

    subject: z.enum(['owner', 'shared']).nullable(),

    itemID: z.string().min(1).nullable(),
    text: z.string().nullable(),
    until: z.number().int().nullable(),
  })
  .readonly();

const callSchema = z
  .strictObject({
    case: z.string().min(1),
    repeat: z.number().int().nonnegative(),

    input: z.string().startsWith('sha256:'),
    writes: z.array(writeSchema).readonly(),
    flags: z.array(z.string()).readonly(),

    failure: z.string().min(1).nullable(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  })
  .readonly();

const reportSchema = z
  .strictObject({
    model: z.string().min(1),
    effort: z.string().min(1),
    repeats: z.number().int().positive(),
    calls: z.array(callSchema).readonly(),
  })
  .readonly();

export type WriterReport = z.infer<typeof reportSchema>;

export type WriterCall = z.infer<typeof callSchema>;

export async function loadWriterReport(path: string): Promise<WriterReport> {
  const json: unknown = await Bun.file(path).json();

  return reportSchema.parse(json);
}
