import { ORPCError } from '@orpc/client';
import { isServerRender } from './is-server-render';

// How a page's first read went: live with a session the API accepted, none when the browser's
// session is refused, or unchecked when the server render was refused, because a browser can leave
// its cookie off a page's first request, as on a launch from the installed app's icon.
export type SessionState = 'live' | 'none' | 'unchecked';

// Runs a page's first read and answers how the session it carried went. Any other failure throws,
// so the page shows its error.
export async function readSessionState(read: () => Promise<unknown>): Promise<SessionState> {
  try {
    await read();

    return 'live';
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') {
      return isServerRender() ? 'unchecked' : 'none';
    }

    throw error;
  }
}
