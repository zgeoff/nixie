import { sessionCookieName } from '@heynixie/contract';

export interface BrowserSignIn {
  readonly appURL: string;

  // the device session's token, which the browser holds as its session cookie
  readonly token: string;
}

// Opens the app in the browser as a device that enrolled before: the browser holds the session
// cookie, as the enrolment response left it, and navigates to the app's first page.
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
