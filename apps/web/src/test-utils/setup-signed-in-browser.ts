import { sessionCookieName } from '@heynixie/contract';

export interface BrowserSignIn {
  readonly appURL: string;

  readonly token: string;
}

export async function setupSignedInBrowser(
  view: Bun.WebView,
  signIn: BrowserSignIn,
): Promise<void> {
  await view.cdp('Network.setCookie', {
    httpOnly: true,
    name: sessionCookieName,
    path: '/',
    sameSite: 'Strict',
    secure: true,
    url: `${signIn.appURL}/`,
    value: signIn.token,
  });

  await view.navigate(`${signIn.appURL}/`);
}
