import { z } from 'zod';
import { definitionIDsSchema, ruleObjectSchema } from './rule-body-schema';
import { legacyRuleContext, ruleContexts } from './rule-contexts';

const fileContextSchema = z.union([
  z.enum(ruleContexts),
  z
    .literal(legacyRuleContext)
    .meta({ deprecated: true, description: 'The old name of the context task' }),
]);

const fileObjectSchema = ruleObjectSchema.extend({
  contexts: z.array(fileContextSchema).min(1).optional(),
  jobs: definitionIDsSchema
    .optional()
    .meta({ deprecated: true, description: 'The old name of definitions' }),
});

export const ruleFieldNames: ReadonlySet<string> = new Set(Object.keys(fileObjectSchema.shape));

// A rules file still accepts the old names jobs and job, because nixie can't rewrite the definitions
// repo. The parsed rule holds only the new names.
export const rulesFileBodySchema = fileObjectSchema
  .refine((rule) => rule.mandate === undefined || rule.expires !== undefined, {
    message: 'a mandate rule needs expires',
    path: ['expires'],
  })
  .refine((rule) => rule.jobs === undefined || rule.definitions === undefined, {
    message: 'a rule holds definitions or its old name jobs, never both',
    path: ['definitions'],
  })
  .refine((rule) => rule.lift === undefined || rule.outcome === 'allow', {
    message: 'a lift is valid only on an allow rule',
    path: ['lift'],
  })
  .meta({ dependentRequired: { mandate: ['expires'] } })
  .transform((rule) => {
    const { jobs, definitions, contexts, ...rest } = rule;
    const names = definitions ?? jobs;

    return {
      ...rest,
      ...(contexts === undefined
        ? {}
        : { contexts: [...new Set(contexts.map((context) => toContext(context)))] }),
      ...(names === undefined ? {} : { definitions: names }),
    };
  });

function toContext(context: z.output<typeof fileContextSchema>): (typeof ruleContexts)[number] {
  return context === legacyRuleContext ? 'task' : context;
}
