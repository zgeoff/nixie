export const watchRoutePath = '/rpc/computer/watch-stream';

// The address of the watch socket, as a path alone. The client resolves it against the origin of its
// own page, which is the API's origin, so no header of the call decides where the ticket goes.
export function buildWatchStreamURL(ticket: string): string {
  return `${watchRoutePath}?ticket=${ticket}`;
}
