import type { RouterContext } from '../types';
import type { SessionState } from './read-session-state';
import { readSessionState } from './read-session-state';

export interface RouteSession {
  readonly session: SessionState;
}

// A page reads its data before it renders, so a form or a link below it sits still. A short
// staleness lets the client keep the server's copy on hydration, and a mutation still refreshes it.
export const routeDataStaleTimeMs = 5000;

export async function readRouteSession(
  context: RouterContext,
  readData: readonly (() => Promise<unknown>)[] = [],
): Promise<RouteSession> {
  const session = await readSessionState(() =>
    context.queryClient.query({
      ...context.queryUtils.sessions.list.queryOptions(),
      staleTime: 'static',
    }),
  );

  // A failed read leaves the page to show its own "did not load" line.
  if (session === 'live') {
    await Promise.allSettled(readData.map((read) => read()));
  }

  return { session };
}
