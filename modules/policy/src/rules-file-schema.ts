import { z } from 'zod';
import { ruleBodySchema } from './rule-body-schema';
import { ruleIDPattern } from './rule-id-pattern';

export const rulesFileSchema = z.record(z.string().regex(ruleIDPattern), ruleBodySchema);
