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

// What a case's every run must stage: a new owner item, a new shared item, an edit of the case's
// target item and no new item, a flag and no write, no owner write, or nothing at all.
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

    // the item an edit_not_add case must edit
    target: z.string().min(1).nullable(),
  })
  .readonly();

const casesSchema = z
  .strictObject({
    persona: z.string().min(1),
    ownerName: z.string().min(1),
    assistantName: z.string().min(1),
    cases: z.array(caseSchema).min(1).readonly(),
  })
  .readonly();

export type WriterCases = z.infer<typeof casesSchema>;

export type WriterCase = WriterCases['cases'][number];

// Loads the memory writer's eval cases: invented batches, each with the rule every run of it must
// meet, written before any model saw a case.
export async function loadWriterCases(path: string): Promise<WriterCases> {
  const json: unknown = await Bun.file(path).json();

  return casesSchema.parse(json);
}
