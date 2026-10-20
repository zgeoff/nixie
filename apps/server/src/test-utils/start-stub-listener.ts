import { onTestFinished } from 'bun:test';

// Listens on a free port of the hostname as an isolation target's listener does, ending each
// connection once it sends data, and stops the listener when the test finishes.
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
