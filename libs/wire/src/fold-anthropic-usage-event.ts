import { z } from 'zod';

export type ReportedUsage = Readonly<Record<string, unknown>>;

const fieldsSchema = z.record(z.string(), z.unknown());

const usageEventSchema = z.union([
  z.object({ type: z.literal('message_start'), message: z.object({ usage: fieldsSchema }) }),
  z.object({ type: z.literal('message_delta'), usage: fieldsSchema }),
]);

// message_start carries the input side of a call's usage and message_delta the running totals, so a
// later event's count replaces an earlier one's.
export function foldAnthropicUsageEvent(reported: ReportedUsage, event: unknown): ReportedUsage {
  const parsed = usageEventSchema.safeParse(event);

  if (!parsed.success) {
    return reported;
  }

  const usage =
    parsed.data.type === 'message_start' ? parsed.data.message.usage : parsed.data.usage;

  return {
    ...reported,
    ...Object.fromEntries(Object.entries(usage).filter(([, value]) => value !== null)),
  };
}
