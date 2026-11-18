import { parseJSONOrNull } from '@heynixie/wire';
import { chatgptAuth } from './chatgpt-auth';
import type { AuthFetch } from './chatgpt-auth';
import { parseRefreshAnswer } from './parse-refresh-answer';
import type { RefreshAnswer } from './parse-refresh-answer';

// The one place the refresh token leaves the gateway, and it goes only to the token endpoint.
export async function requestTokenRefresh(
  send: AuthFetch,
  refreshToken: string,
): Promise<RefreshAnswer> {
  try {
    const response = await send(chatgptAuth.tokenURL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: chatgptAuth.clientID,
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(chatgptAuth.requestTimeoutMs),
    });

    const text = await response.text();

    return parseRefreshAnswer(response.status, parseJSONOrNull(text));
  } catch {
    return { kind: 'no_answer' };
  }
}
