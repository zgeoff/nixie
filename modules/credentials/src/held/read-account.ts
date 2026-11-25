import type { OAuthProvider } from '../types';
import { parseIDToken } from './parse-id-token';
import type { TokenReply } from './send-token-request';
import { TokenRequestError } from './token-request-error';
import type { TokenResult } from './types';

// The account an ID token names, read only after its issuer, audience and expiry passed. A token that
// fails a check drops the reply's tokens and throws.
export async function readAccount(
  reply: TokenReply,
  provider: OAuthProvider,
  nowMs: number,
  dropTokens: () => Promise<void>,
): Promise<TokenResult['account']> {
  if (reply.id_token === undefined) {
    return null;
  }

  const parsed = parseIDToken(reply.id_token, {
    issuer: provider.issuer,
    audience: provider.clientID,
    nowMs,
  });

  if (!parsed.isValid) {
    await dropTokens();

    throw new TokenRequestError(parsed.code);
  }

  return { subject: parsed.subject, email: parsed.email };
}
