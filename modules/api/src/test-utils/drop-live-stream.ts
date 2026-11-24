import { clientHeaderName } from '@heynixie/contract';

// Opens a live stream over a raw socket and waits for its first event, then terminates the socket
// with no close from the client, as a client that lost its network does.
export async function dropLiveStream(
  url: string,
  token: string,
  input: Readonly<Record<string, unknown>>,
): Promise<void> {
  const target = new URL(url);

  const body = JSON.stringify({ json: input });
  const opened = Promise.withResolvers<void>();

  const socket = await Bun.connect({
    hostname: target.hostname,
    port: Number(target.port),
    socket: {
      open: (connected) => {
        connected.write(
          [
            'POST /rpc/live/follow HTTP/1.1',
            `host: ${target.host}`,
            `authorization: Bearer ${token}`,
            `${clientHeaderName}: test`,
            'content-type: application/json',
            `content-length: ${Buffer.byteLength(body)}`,
            '',
            body,
          ].join('\r\n'),
        );
      },
      data: (_connected, chunk) => {
        if (chunk.toString().includes('opened')) {
          opened.resolve();
        }
      },
      close: () => {
        opened.reject(new Error('the server closed the socket before the stream opened'));
      },
      error: (_connected, error) => {
        opened.reject(error);
      },
    },
  });

  await opened.promise;

  socket.terminate();
}
