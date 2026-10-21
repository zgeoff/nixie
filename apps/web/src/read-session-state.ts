import { ORPCError } from '@orpc/client';
import { isServerRender } from './is-server-render';

// A refused server render is unchecked rather than none, because a browser can leave its cookie
// off a page's first request, as on a launch from the installed app's icon.
export type SessionState = 'live' | 'none' | 'unchecked';

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
