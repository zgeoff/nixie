import { randomUUID } from 'node:crypto';
import type { AuthFetch } from './chatgpt-auth';
import { chatgptAuth } from './chatgpt-auth';
import { parseIDToken } from './parse-id-token';
import { pollDeviceCode } from './poll-device-code';
import { requestCodeExchange } from './request-code-exchange';
import { requestDeviceCode } from './request-device-code';
import { withLoginLock } from './with-login-lock';
import { writeLoginFile } from './write-login-file';

export interface ChatGPTLoginDeps {
  readonly routeID: string;
  readonly loginPath: string;
  readonly send: AuthFetch;

  // the command's output, which holds no token
  readonly write: (text: string) => void;
  readonly now: () => number;
  readonly sleep: (delayMs: number) => Promise<void>;
}

// Signs in with the device code flow and writes the login file, whatever file the route had. True
// when it signed in.
export async function runChatGPTLogin(deps: ChatGPTLoginDeps): Promise<boolean> {
  const code = await requestDeviceCode(deps.send);

  if (code === null) {
    deps.write(
      "Device code login is off for this account. Turn it on in ChatGPT's security settings, then run the command again.\n",
    );

    return false;
  }

  const minutes = chatgptAuth.deviceCodeLifetimeMs / 60_000;

  deps.write(
    `Open ${chatgptAuth.deviceVerificationURL} and enter the code ${code.userCode} (expires in ${String(minutes)} minutes).\n`,
  );

  const approval = await pollDeviceCode(deps, code);

  if (approval === null) {
    deps.write('The code expired before anyone approved it. Run the command again.\n');

    return false;
  }

  const tokens = await requestCodeExchange(deps.send, approval);

  const identity = parseIDToken(tokens.id_token);

  if (identity === null) {
    deps.write('The sign-in gave no account, plan and email, so nothing was stored.\n');

    return false;
  }

  const nowIso = new Date(deps.now()).toISOString();

  await withLoginLock(deps.loginPath, () =>
    writeLoginFile(deps.loginPath, {
      version: 1,
      loginID: randomUUID(),
      refreshToken: tokens.refresh_token,
      accountID: identity.accountID,
      planType: identity.planType,
      email: identity.email,
      status: 'active',
      reason: null,
      statusSince: nowIso,
      lastRefreshAt: nowIso,
    }),
  );

  deps.write(
    `Signed in: ${identity.email}, plan ${identity.planType}. Stored for ${deps.routeID}.\n`,
  );

  return true;
}
