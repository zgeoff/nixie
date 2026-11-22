export const watchRoutePath = '/rpc/computer/watch-stream';

// The WebSocket URL on the API's own origin, taken from the Origin header of the call. A call that
// sends none gets the path alone, which a client resolves against its own origin.
export function buildWatchStreamURL(origin: string | undefined, ticket: string): string {
  const path = `${watchRoutePath}?ticket=${ticket}`;

  if (origin === undefined) {
    return path;
  }

  const parsed = URL.parse(origin);

  if (parsed === null || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    return path;
  }

  const scheme = parsed.protocol === 'https:' ? 'wss:' : 'ws:';

  return `${scheme}//${parsed.host}${path}`;
}
