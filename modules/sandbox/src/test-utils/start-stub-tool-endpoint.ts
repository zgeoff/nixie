import { onTestFinished } from 'bun:test';

// A tool endpoint on a unix socket that answers each request with the path and the bearer token it
// saw, so a test sees what reached nixie's side of a tool route. It stops when the test finishes.
export function startStubToolEndpoint(socketPath: string): void {
  const server = Bun.serve({
    unix: socketPath,
    fetch: (request) =>
      Response.json({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
      }),
  });

  onTestFinished(() => server.stop(true));
}
