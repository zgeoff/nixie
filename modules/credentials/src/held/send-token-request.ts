import { z } from 'zod';
import type { CredentialFetch } from '../types';

const tokenReplySchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).exactOptional(),
  expires_in: z.number().positive().default(3600),
  id_token: z.string().exactOptional(),
  scope: z.string().exactOptional(),
  refresh_token_expires_in: z.number().positive().exactOptional(),
});

export type TokenReply = z.output<typeof tokenReplySchema>;

export type TokenRequestResult =
  | { readonly kind: 'tokens'; readonly reply: TokenReply }
  | { readonly kind: 'refused' }
  | { readonly kind: 'service_error' }
  | { readonly kind: 'no_answer' };

// A refusal for good: the grant, or the client that holds it, is no longer accepted.
const refusalErrors: ReadonlySet<string> = new Set([
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
]);

const errorReplySchema = z.object({ error: z.string() });

// Sends a form to the provider's token endpoint through the credential fetcher, so the pinned
// connection, the body cap and the scrub apply, and sorts the answer. A provider that has not
// answered after the deadline counts as no answer.
export async function sendTokenRequest(
  send: CredentialFetch,
  tokenURL: string,
  form: Readonly<Record<string, string>>,
  timeoutMs: number,
): Promise<TokenRequestResult> {
  let response: Response;

  try {
    response = await send(tokenURL, {
      method: 'POST',
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { kind: 'no_answer' };
  }

  const body: unknown = await response.json().catch(() => null);

  if (response.ok) {
    const parsed = tokenReplySchema.safeParse(body);

    return parsed.success ? { kind: 'tokens', reply: parsed.data } : { kind: 'service_error' };
  }

  const failure = errorReplySchema.safeParse(body);

  const isRefusal =
    (response.status === 400 || response.status === 401) &&
    failure.success &&
    refusalErrors.has(failure.data.error);

  return { kind: isRefusal ? 'refused' : 'service_error' };
}
