import { ORPCError } from '@orpc/client';
import { match } from 'ts-pattern';
import { z } from 'zod';

const expirySchema = z.discriminatedUnion('reason', [
  z.object({ reason: z.literal('expires_past'), now: z.string() }),
  z.object({
    reason: z.literal('expires_beyond_max'),
    maxHours: z.number(),
    latestExpiry: z.string(),
  }),
]);

const faultsSchema = z.object({
  faults: z.array(z.string()),
  expiry: expirySchema.optional(),
});

const words: Readonly<Record<string, string>> = {
  CONFLICT: 'This changed since the card showed it, so nothing changed. Check the new version.',
  CLOSED: 'This was answered, withdrawn or lapsed, so nothing changed.',
  NOT_FOUND: 'This is gone, so nothing changed.',
  NOT_ALLOWED: 'The rule takes no such change, so nothing changed.',
};

// The sentences for a failed rule or mandate call: each fault the host found in the rule, or one
// line for a refusal, so nothing fails silently.
export function describeRuleError(error: unknown): readonly string[] {
  if (!(error instanceof ORPCError)) {
    return ['The call did not finish, so nothing changed. Try again.'];
  }

  const code: unknown = error.code;

  if (code === 'INVALID') {
    const parsed = faultsSchema.safeParse(error.data);

    if (parsed.success && parsed.data.expiry !== undefined) {
      return [describeExpiry(parsed.data.expiry)];
    }

    return parsed.success && parsed.data.faults.length > 0
      ? parsed.data.faults
      : ['The rule breaks the rule format, so nothing changed.'];
  }

  const line = typeof code === 'string' ? words[code] : undefined;

  return [line ?? 'The host refused this, so nothing changed.'];
}

function describeExpiry(expiry: z.infer<typeof expirySchema>): string {
  return match(expiry)
    .with(
      { reason: 'expires_past' },
      (past) => `The end must be after ${new Date(past.now).toLocaleString()}.`,
    )
    .with(
      { reason: 'expires_beyond_max' },
      (beyond) =>
        `A mandate lasts at most ${beyond.maxHours} hours. The latest end you can ask for is ${new Date(beyond.latestExpiry).toLocaleString()}.`,
    )
    .exhaustive();
}
