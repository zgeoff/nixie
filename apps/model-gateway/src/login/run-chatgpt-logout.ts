import { rm } from 'node:fs/promises';
import { withLoginLock } from './with-login-lock';

export interface ChatGPTLogoutDeps {
  readonly routeID: string;
  readonly loginPath: string;
  readonly write: (text: string) => void;
}

export async function runChatGPTLogout(deps: ChatGPTLogoutDeps): Promise<void> {
  await withLoginLock(deps.loginPath, () => rm(deps.loginPath, { force: true }));

  deps.write(
    `Removed the login for ${deps.routeID}. Sign this device out in ChatGPT's security settings.\n`,
  );
}
