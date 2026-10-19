import { z } from 'zod';

const writeSchema = z
  .strictObject({
    op: z.enum(['remember', 'retire']),

    // the memory's subject, or null for a retirement
    subject: z.enum(['owner', 'shared']).nullable(),

    // the item an edit or a retirement changes, or null for a new item
    itemID: z.string().min(1).nullable(),
    text: z.string().nullable(),
  })
  .readonly();

const callSchema = z
  .strictObject({
    case: z.string().min(1),
    repeat: z.number().int().nonnegative(),

    // the SHA-256 of the system prompt, the batch prompt and the tools the run sent
    input: z.string().startsWith('sha256:'),
    writes: z.array(writeSchema).readonly(),
    flags: z.array(z.string()).readonly(),

    // why the run ended without the model's last reply, or null when it finished
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

// Loads a committed memory writer eval report: the model and what each run staged.
export async function loadWriterReport(path: string): Promise<WriterReport> {
  const json: unknown = await Bun.file(path).json();

  return reportSchema.parse(json);
}
