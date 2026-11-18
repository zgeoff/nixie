import { parseJSONOrNull } from '@heynixie/wire';
import { z } from 'zod';
import { chatgptAuth } from './chatgpt-auth';
import type { AuthFetch } from './chatgpt-auth';

const deviceCodeSchema = z
  .object({
    device_auth_id: z.string().min(1),
    user_code: z.string().min(1).optional(),
    usercode: z.string().min(1).optional(),
    interval: z.union([z.string(), z.number()]).optional(),
  })
  .transform((answer, ctx) => {
    const userCode = answer.user_code ?? answer.usercode;

    if (userCode === undefined) {
      ctx.addIssue({ code: 'custom', message: 'the answer holds no user code' });

      return z.NEVER;
    }

    const seconds = Number(answer.interval ?? 5);

    return {
      deviceAuthID: answer.device_auth_id,
      userCode,
      intervalMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000,
    };
  });

export type DeviceCode = z.output<typeof deviceCodeSchema>;

// null when OpenAI answers 404, which means device code login is off for the account
export async function requestDeviceCode(send: AuthFetch): Promise<DeviceCode | null> {
  const response = await send(chatgptAuth.deviceCodeURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: chatgptAuth.clientID }),
    signal: AbortSignal.timeout(chatgptAuth.requestTimeoutMs),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`the device code request failed with status ${String(response.status)}`);
  }

  const text = await response.text();

  return deviceCodeSchema.parse(parseJSONOrNull(text));
}
