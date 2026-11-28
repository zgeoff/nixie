import { parseJSONOrNull } from '@heynixie/wire';
import { z } from 'zod';

const reasonSchema = z.object({ reason: z.string().exactOptional() });

const errorBodySchema = z.object({
  error: z.object({
    errors: z.array(reasonSchema).exactOptional(),
    details: z.array(reasonSchema).exactOptional(),
  }),
});

export interface GoogleError {
  readonly reason: string;

  // Google's own quota answer: 429, or 403 whose structured reason is a rate limit
  readonly isRateLimit: boolean;
}

// What an error answer of Google's APIs says. Only the structured reasons of the JSON body count,
// so a message that quotes a rate-limit word never turns a refusal into a quota answer.
export function readGoogleError(text: string, status: number, service: string): GoogleError {
  const parsed = errorBodySchema.safeParse(parseJSONOrNull(text));

  const reasons = parsed.success
    ? [...(parsed.data.error.errors ?? []), ...(parsed.data.error.details ?? [])].flatMap(
        (entry) => entry.reason ?? [],
      )
    : [];

  const [first] = reasons;

  return {
    reason:
      first === undefined
        ? `${service} answered ${String(status)}`
        : `${service} answered ${first}`,
    isRateLimit:
      status === 429 ||
      (status === 403 && reasons.some((reason) => /^(?:user)?rateLimitExceeded$/iu.test(reason))),
  };
}
