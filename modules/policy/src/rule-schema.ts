import { z } from 'zod';
import { effectNames } from './effect-names';
import { ruleContexts } from './rule-contexts';
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

export const ruleBodySchema = z
  .strictObject({
    outcome: z.enum(['allow', 'ask', 'deny']),
    tools: z
      .array(patternSchema)
      .min(1)
      .optional()
      .describe('Tool names, such as mail.send, or a tool variant, such as task.start/atc'),
    effects: z.array(z.enum(effectNames)).min(1).optional(),
    contexts: z.array(z.enum(ruleContexts)).min(1).optional(),
    jobs: z.array(z.string().min(1)).min(1).optional(),
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
  });

export const rulesFileSchema = z.record(z.string().regex(ruleIDPattern), ruleBodySchema);
