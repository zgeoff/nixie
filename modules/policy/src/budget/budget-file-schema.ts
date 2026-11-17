import { z } from 'zod';
import { budgetIDPattern } from './budget-id-pattern';

export const budgetPeriods = ['day', 'week', 'month'] as const;

const countsSchema = z
  .string()
  .regex(/^(?:spend|tool:\S+)$/u, 'counts is spend, or tool: and a tool name')
  .describe('What the budget counts: spend, or tool:<name> for one paid tool');

const budgetSchema = z.strictObject({
  counts: countsSchema,
  limit: z.number().positive().describe('The limit in dollars'),
  period: z.enum(budgetPeriods).describe('A day, a week from Monday, or a month'),
});

export const budgetFileSchema = z.record(z.string().regex(budgetIDPattern), budgetSchema);
