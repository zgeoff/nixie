import { onTestFinished } from 'bun:test';

export function startStubListener(hostname: string) {
  const listener = Bun.listen({
    hostname,
    port: 0,
    socket: {
      data: (socket) => {
        socket.end();
      },
    },
  });

  onTestFinished(() => {
    listener.stop(true);
  });

  return listener;
}
