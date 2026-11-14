import { z } from 'zod';
import { rulesFileSchema } from './rules-file-schema';

export function buildRulesJSONSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(rulesFileSchema, { io: 'input', target: 'draft-2020-12' });

  return {
    ...schema,
    title: 'nixie rules file',
    description:
      'A YAML file under rules/ in the definitions, which maps each rule ID to its rule. An ID names one rule across every file.',
  };
}
