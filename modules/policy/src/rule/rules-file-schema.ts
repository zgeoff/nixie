import { z } from 'zod';
import { ruleIDPattern } from './rule-id-pattern';
import { rulesFileBodySchema } from './rules-file-body-schema';

export const rulesFileSchema = z.record(z.string().regex(ruleIDPattern), rulesFileBodySchema);
