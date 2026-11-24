import { canBeBotChallenge } from '@heynixie/wire';

export interface Landing {
  readonly url: string;
  readonly status: number;
  readonly blocked: string | null;
}

// The status and blocked reason a navigation found belong to the page it landed on. When the tab
// shows another address by the time it is read, a challenge status and its reason belong to a page
// the read no longer shows, so both drop. Any other status stays: a page may rewrite its own address.
export function pickLandedStatus(
  landing: Landing,
  seenURLs: readonly string[],
): { readonly status: number; readonly blocked: string | null } {
  const [landedURL] = landing.url.split('#');
  const hasMoved = seenURLs.some((url) => url.split('#')[0] !== landedURL);

  if (!hasMoved) {
    return { status: landing.status, blocked: landing.blocked };
  }

  return { status: canBeBotChallenge(landing.status) ? 0 : landing.status, blocked: null };
}
