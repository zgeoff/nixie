import type { z } from 'zod';

export function formatIssue(issue: z.core.$ZodIssue): string {
  return issue.path.length === 0 ? issue.message : `${issue.path.join('.')}: ${issue.message}`;
}
