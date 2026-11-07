export function readClosedPort(): number {
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data: (socket) => {
        socket.end();
      },
    },
  });

  const port = listener.port;

  listener.stop(true);

  return port;
}
