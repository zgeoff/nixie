import { onTestFinished } from 'bun:test';

export function startStubToolEndpoint(socketPath: string): void {
  const server = Bun.serve({
    unix: socketPath,
    fetch: answerRequest,
  });

  onTestFinished(() => server.stop(true));
}

function answerRequest(request: Request): Response {
  return Response.json({
    path: new URL(request.url).pathname,
    authorization: request.headers.get('authorization'),
  });
}
