const driveScope = 'https://www.googleapis.com/auth/drive.file';

export interface TokenAnswer {
  readonly accessToken: string | null;
  readonly scope: string | null;
}

export type DriveTokenPick =
  | { readonly kind: 'ok'; readonly token: string }
  | { readonly kind: 'refused'; readonly message: string };

// The token that Google's sign-in gave is for the Drive picker only when it holds the scope
// `drive.file` and no other. A token that holds more, such as one that includes the scopes of the
// connection, never reaches the picker.
export function pickDriveToken(answer: TokenAnswer): DriveTokenPick {
  if (answer.accessToken === null || answer.scope === null) {
    return { kind: 'refused', message: 'Google gave no access token for the picker.' };
  }

  const scopes = answer.scope.split(/\s+/u).filter((scope) => scope !== '');

  if (scopes.length !== 1 || scopes[0] !== driveScope) {
    return {
      kind: 'refused',
      message: 'Google gave a token for more than Drive files, so nixie dropped it.',
    };
  }

  return { kind: 'ok', token: answer.accessToken };
}
