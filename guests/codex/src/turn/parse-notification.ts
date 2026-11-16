import { z } from 'zod';

const countSchema = z.number().int().nonnegative();

const breakdownSchema = z.object({
  totalTokens: countSchema,
  inputTokens: countSchema,
  cachedInputTokens: countSchema,
  cacheWriteInputTokens: countSchema,
  outputTokens: countSchema,
  reasoningOutputTokens: countSchema,
});

export type TokenBreakdown = z.infer<typeof breakdownSchema>;

// The error that a failed turn or an error notification holds. The CLI names the class of failure
// in codexErrorInfo, as a string or as an object keyed by the class.
const turnErrorSchema = z.object({
  message: z.string(),
  codexErrorInfo: z.unknown().optional(),
  additionalDetails: z.string().nullish(),
});

export type TurnError = z.infer<typeof turnErrorSchema>;

const tokenUsageSchema = z.object({ total: breakdownSchema, last: breakdownSchema });
const tokenUsageParamsSchema = z.object({ turnId: z.string(), tokenUsage: tokenUsageSchema });

const tokenUsageNotificationSchema = z.object({
  method: z.literal('thread/tokenUsage/updated'),
  params: tokenUsageParamsSchema,
});

const itemSchema = z.object({ type: z.string(), id: z.string(), text: z.string().optional() });
const itemParamsSchema = z.object({ turnId: z.string(), item: itemSchema });

const itemNotificationSchema = z.object({
  method: z.literal('item/completed'),
  params: itemParamsSchema,
});

const turnStatusSchema = z.enum(['completed', 'interrupted', 'failed', 'inProgress']);

const turnSchema = z.object({
  id: z.string(),
  status: turnStatusSchema,
  error: turnErrorSchema.nullish(),
});

const completedNotificationSchema = z.object({
  method: z.literal('turn/completed'),
  params: z.object({ turn: turnSchema }),
});

const errorParamsSchema = z.object({
  turnId: z.string(),
  willRetry: z.boolean(),
  error: turnErrorSchema,
});

const errorNotificationSchema = z.object({
  method: z.literal('error'),
  params: errorParamsSchema,
});

const serverStatusSchema = z.enum(['starting', 'ready', 'failed', 'cancelled']);

const serverStatusParamsSchema = z.object({
  name: z.string(),
  status: serverStatusSchema,
  error: z.string().nullish(),
});

const serverStatusNotificationSchema = z.object({
  method: z.literal('mcpServer/startupStatus/updated'),
  params: serverStatusParamsSchema,
});

const notificationSchema = z.discriminatedUnion('method', [
  tokenUsageNotificationSchema,
  itemNotificationSchema,
  completedNotificationSchema,
  errorNotificationSchema,
  serverStatusNotificationSchema,
]);

export type CodexNotification = z.infer<typeof notificationSchema>;

// Reads the notifications that a turn acts on, and gives null for every other one.
export function parseNotification(method: string, params: unknown): CodexNotification | null {
  const parsed = notificationSchema.safeParse({ method, params });

  return parsed.success ? parsed.data : null;
}
