import { z } from 'zod';
import { budgetFileSchema } from './budget-file-schema';

export function buildBudgetsJSONSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(budgetFileSchema, { io: 'input', target: 'draft-2020-12' });

  return {
    ...schema,
    title: 'nixie budgets file',
    description:
      'A YAML file under budgets/ in the definitions, which maps each budget ID to its budget. An ID names one budget across every file.',
  };
}
