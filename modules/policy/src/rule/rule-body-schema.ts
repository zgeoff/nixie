import { z } from 'zod';
import { budgetIDPattern } from '../budget/budget-id-pattern';
import { effectNames } from '../utils/effect-names';
import { destinationPatternSchema } from './destination-pattern-schema';
import { ruleContexts } from './rule-contexts';
import { ruleIDPattern } from './rule-id-pattern';
import { ruleSources } from './rule-sources';

const argumentPathSchema = z
  .string()
  .regex(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/u, 'an argument path is names joined by dots')
  .describe('The argument the check reads, such as memory or to.address');

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);

const checkPatternSchema = z
  .string()
  .min(1)
  .describe('Exact text, or a pattern whose only wildcard is *, which matches any run of text');

const checkPatternsSchema = z.union([checkPatternSchema, z.array(checkPatternSchema).min(1)]);

const checkSchema = z.discriminatedUnion('op', [
  z.strictObject({ arg: argumentPathSchema, op: z.literal('eq'), value: scalarSchema }),
  z.strictObject({
    arg: argumentPathSchema,
    op: z.literal('in'),
    value: z.array(scalarSchema).min(1),
  }),
  z.strictObject({
    arg: argumentPathSchema,
    op: z.literal('matches'),
    value: checkPatternsSchema.describe('A pattern, or a list of patterns of which one must match'),
  }),
  z.strictObject({
    arg: argumentPathSchema,
    op: z.literal('excludes'),
    value: checkPatternsSchema.describe('A pattern, or a list of patterns of which none may match'),
  }),
]);

export const definitionIDsSchema = z.array(z.string().min(1)).min(1);

const liftSchema = z
  .strictObject({
    perAction: z.number().positive().describe('The most one call may cost, in dollars'),
    budget: z.string().regex(budgetIDPattern).describe('The ID of a budget that counts spend'),
  })
  .describe('Lets a purchase through without asking, within one call cap and a budget');

export const ruleObjectSchema = z.strictObject({
  outcome: z.enum(['allow', 'ask', 'deny']),
  tools: z
    .array(destinationPatternSchema)
    .min(1)
    .optional()
    .describe('Tool names, such as mail.send, or a tool variant, such as task.start/atc'),
  effects: z.array(z.enum(effectNames)).min(1).optional(),
  contexts: z.array(z.enum(ruleContexts)).min(1).optional(),
  definitions: definitionIDsSchema
    .optional()
    .describe('Task definition IDs; the rule matches a task run of one of them'),
  checks: z.array(checkSchema).min(1).optional(),
  destinations: z.array(destinationPatternSchema).min(1).optional(),
  sources: z.array(z.enum(ruleSources)).min(1).optional(),
  expires: z.iso.datetime({ offset: true }).optional(),
  mandate: z.string().regex(ruleIDPattern).optional(),
  lift: liftSchema.optional(),
  cel: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});

export const ruleBodySchema = ruleObjectSchema
  .refine((rule) => rule.mandate === undefined || rule.expires !== undefined, {
    message: 'a mandate rule needs expires',
    path: ['expires'],
  })
  .refine((rule) => rule.lift === undefined || rule.outcome === 'allow', {
    message: 'a lift is valid only on an allow rule',
    path: ['lift'],
  })
  .meta({ dependentRequired: { mandate: ['expires'] } });
