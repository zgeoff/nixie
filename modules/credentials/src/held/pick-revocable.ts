import type { TokenReply } from './send-token-request';

// The token whose revocation ends the grant: the refresh token, or the access token when the reply
// holds no refresh token.
export function pickRevocable(reply: TokenReply): string {
  return reply.refresh_token ?? reply.access_token;
}
