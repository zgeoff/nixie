import { z } from 'zod';
import { effectNames } from './effect-names';
import { legacyRuleContext, ruleContexts } from './rule-contexts';
import { ruleIDPattern } from './rule-id-pattern';
import { ruleSources } from './rule-sources';

const patternSchema = z
  .string()
  .regex(/^\S+$/u, 'a pattern holds no spaces')
  .describe('Exact text, or a pattern whose only wildcard is *, which matches any run of text');

const argumentPathSchema = z
  .string()
  .regex(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/u, 'an argument path is names joined by dots')
  .describe('The argument the check reads, such as memory or to.address');

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);

const checkSchema = z.discriminatedUnion('op', [
  z.strictObject({ arg: argumentPathSchema, op: z.literal('eq'), value: scalarSchema }),
  z.strictObject({
    arg: argumentPathSchema,
    op: z.literal('in'),
    value: z.array(scalarSchema).min(1),
  }),
  z.strictObject({ arg: argumentPathSchema, op: z.literal('matches'), value: patternSchema }),
]);

const contextSchema = z.union([
  z.enum(ruleContexts),
  z
    .literal(legacyRuleContext)
    .meta({ deprecated: true, description: 'The old name of the context task' }),
]);

const definitionIDsSchema = z.array(z.string().min(1)).min(1);

export const ruleBodySchema = z
  .strictObject({
    outcome: z.enum(['allow', 'ask', 'deny']),
    tools: z
      .array(patternSchema)
      .min(1)
      .optional()
      .describe('Tool names, such as mail.send, or a tool variant, such as task.start/atc'),
    effects: z.array(z.enum(effectNames)).min(1).optional(),
    contexts: z.array(contextSchema).min(1).optional(),
    definitions: definitionIDsSchema
      .optional()
      .describe('Task definition IDs; the rule matches a task run of one of them'),
    jobs: definitionIDsSchema
      .optional()
      .meta({ deprecated: true, description: 'The old name of definitions' }),
    checks: z.array(checkSchema).min(1).optional(),
    destinations: z.array(patternSchema).min(1).optional(),
    sources: z.array(z.enum(ruleSources)).min(1).optional(),
    expires: z.iso.datetime({ offset: true }).optional(),
    mandate: z.string().regex(ruleIDPattern).optional(),
    cel: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .refine((rule) => rule.mandate === undefined || rule.expires !== undefined, {
    message: 'a mandate rule needs expires',
    path: ['expires'],
  })
  .refine((rule) => rule.jobs === undefined || rule.definitions === undefined, {
    message: 'a rule holds definitions or its old name jobs, never both',
    path: ['definitions'],
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

function toContext(context: z.output<typeof contextSchema>): (typeof ruleContexts)[number] {
  return context === legacyRuleContext ? 'task' : context;
}
