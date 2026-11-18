import { parseJSONOrNull } from '@heynixie/wire';
import { z } from 'zod';
import { chatgptAuth } from './chatgpt-auth';
import type { AuthFetch } from './chatgpt-auth';
import type { DeviceCode } from './request-device-code';

const approvalSchema = z.object({
  authorization_code: z.string().min(1),
  code_challenge: z.string(),
  code_verifier: z.string().min(1),
});

export type DeviceApproval = z.output<typeof approvalSchema>;

export interface PollDeviceCodeDeps {
  readonly send: AuthFetch;
  readonly now: () => number;
  readonly sleep: (delayMs: number) => Promise<void>;
}

// null when the code expires before the operator approves it
export async function pollDeviceCode(
  deps: PollDeviceCodeDeps,
  code: DeviceCode,
): Promise<DeviceApproval | null> {
  const deadlineMs = deps.now() + chatgptAuth.deviceCodeLifetimeMs;

  while (deps.now() < deadlineMs) {
    const response = await deps.send(chatgptAuth.deviceTokenURL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_auth_id: code.deviceAuthID, user_code: code.userCode }),
      signal: AbortSignal.timeout(chatgptAuth.requestTimeoutMs),
    });

    if (response.ok) {
      const text = await response.text();

      return approvalSchema.parse(parseJSONOrNull(text));
    }

    // 403 and 404 mean the operator has not approved the code yet
    if (response.status !== 403 && response.status !== 404) {
      throw new Error(`the device code poll failed with status ${String(response.status)}`);
    }

    await deps.sleep(code.intervalMs);
  }

  return null;
}
