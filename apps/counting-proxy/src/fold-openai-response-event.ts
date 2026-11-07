import type { ReportedUsage } from '@heynixie/wire';
import { z } from 'zod';

const usageSchema = z.record(z.string(), z.unknown());

const finalEventSchema = z.object({
  type: z.enum(['response.completed', 'response.incomplete', 'response.failed']),
  response: z.object({ usage: usageSchema }),
});

// A Responses stream reports its usage once, on the event that ends the response, and a response
// that stopped early or failed has spent on what it read too.
export function foldOpenAIResponseEvent(reported: ReportedUsage, event: unknown): ReportedUsage {
  const parsed = finalEventSchema.safeParse(event);

  return parsed.success ? parsed.data.response.usage : reported;
}
