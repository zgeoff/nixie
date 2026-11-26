import { loadGoogleScript } from './load-google-script';
import type { TokenAnswer } from './pick-drive-token';
import { readGoogleMember } from './read-google-member';

export interface PickerTokenRequest {
  readonly clientID: string;

  // the connection's account, which Google signs in as
  readonly account: string;
}

const signInSource = 'https://accounts.google.com/gsi/client';
const driveScope = 'https://www.googleapis.com/auth/drive.file';

// Loads Google's sign-in script ahead of the click that needs it, because the browser lets a popup
// open only shortly after the click, and a script that loads after it can outlast that time.
export function loadPickerSignIn(): Promise<void> {
  return loadGoogleScript(signInSource, () => readOAuth2() !== undefined);
}

// Asks Google's sign-in for an access token of the browser's own, for Drive's picker. The token asks
// for `drive.file` alone and never adds the scopes already granted, so it stays apart from the
// connection's tokens, which never reach the page. The script must be loaded before the click.
export function requestPickerToken(request: PickerTokenRequest): Promise<TokenAnswer> {
  const initTokenClient = readGoogleMember(readOAuth2(), 'initTokenClient');

  if (typeof initTokenClient !== 'function') {
    return Promise.reject(new TypeError('Google sign-in did not load.'));
  }

  return new Promise((resolve, reject) => {
    const client: unknown = Reflect.apply(initTokenClient, readOAuth2(), [
      {
        client_id: request.clientID,
        scope: driveScope,
        include_granted_scopes: false,
        login_hint: request.account,
        callback: (response: unknown) => {
          const token = readGoogleMember(response, 'access_token');
          const scope = readGoogleMember(response, 'scope');

          resolve({
            accessToken: typeof token === 'string' ? token : null,
            scope: typeof scope === 'string' ? scope : null,
          });
        },
        error_callback: () => {
          reject(new Error('Google sign-in was closed or blocked.'));
        },
      },
    ]);

    const requestAccessToken = readGoogleMember(client, 'requestAccessToken');

    if (typeof requestAccessToken !== 'function') {
      reject(new Error('Google sign-in did not load.'));

      return;
    }

    Reflect.apply(requestAccessToken, client, []);
  });
}

function readOAuth2(): unknown {
  return readGoogleMember(
    readGoogleMember(Reflect.get(globalThis, 'google'), 'accounts'),
    'oauth2',
  );
}
