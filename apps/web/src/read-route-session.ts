import type { SessionState } from './read-session-state';
import { readSessionState } from './read-session-state';
import type { RouterContext } from './types';

export interface RouteSession {
  readonly session: SessionState;
}

export async function readRouteSession(context: RouterContext): Promise<RouteSession> {
  const session = await readSessionState(() =>
    context.queryClient.query({
      ...context.queryUtils.memory.writerStatus.queryOptions(),
      staleTime: 'static',
    }),
  );

  return { session };
}
