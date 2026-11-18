import { parseJSONOrNull } from '@heynixie/wire';
import { z } from 'zod';
import { chatgptAuth } from './chatgpt-auth';
import type { AuthFetch } from './chatgpt-auth';
import type { DeviceApproval } from './poll-device-code';

const tokensSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});

export type LoginTokens = z.output<typeof tokensSchema>;

export async function requestCodeExchange(
  send: AuthFetch,
  approval: DeviceApproval,
): Promise<LoginTokens> {
  const response = await send(chatgptAuth.tokenURL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: chatgptAuth.clientID,
      code: approval.authorization_code,
      redirect_uri: chatgptAuth.deviceRedirectURI,
      code_verifier: approval.code_verifier,
    }).toString(),
    signal: AbortSignal.timeout(chatgptAuth.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`the code exchange failed with status ${String(response.status)}`);
  }

  const text = await response.text();

  return tokensSchema.parse(parseJSONOrNull(text));
}
