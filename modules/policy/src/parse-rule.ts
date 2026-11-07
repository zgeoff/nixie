import { z } from 'zod';
import { ruleBodySchema } from './rule-body-schema';
import { ruleIDPattern } from './rule-id-pattern';
import { toRuleForm } from './to-rule-form';
import type { RuleForm } from './types';

const storedRuleSchema = z.looseObject({ id: z.string().regex(ruleIDPattern) });

export function parseRule(value: unknown): RuleForm {
  const stored = storedRuleSchema.parse(value);
  const { id, ...body } = stored;

  return toRuleForm({ id, ...ruleBodySchema.parse(body) });
}
