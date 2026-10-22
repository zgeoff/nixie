import { z } from 'zod';

const itemSchema = z
  .strictObject({
    itemID: z.string().min(1),
    subject: z.enum(['owner', 'shared']),
    text: z.string().min(1),
  })
  .readonly();

const messageSchema = z
  .strictObject({ role: z.enum(['owner', 'assistant']), text: z.string().min(1) })
  .readonly();

const ruleSchema = z.enum([
  'owner_item',
  'shared_item',
  'edit_not_add',
  'flag_only',
  'no_owner_item',
  'nothing',
]);

const caseSchema = z
  .strictObject({
    id: z.string().min(1),
    items: z.array(itemSchema).readonly(),
    messages: z.array(messageSchema).min(1).readonly(),
    rule: ruleSchema,

    target: z.string().min(1).nullable(),

    patterns: z.array(z.string().min(1)).readonly(),

    until: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .readonly();

const casesSchema = z
  .strictObject({
    persona: z.string().min(1),
    ownerName: z.string().min(1),
    assistantName: z.string().min(1),
    timeZone: z.string().min(1),
    cases: z.array(caseSchema).min(1).readonly(),
  })
  .readonly();

export type WriterCases = z.infer<typeof casesSchema>;

export type WriterCase = WriterCases['cases'][number];

export async function loadWriterCases(path: string): Promise<WriterCases> {
  const json: unknown = await Bun.file(path).json();

  return casesSchema.parse(json);
}
