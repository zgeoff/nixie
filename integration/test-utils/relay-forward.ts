// A TCP forwarder for the relay imp of the codex gates: it passes each connection, byte for byte, to
// a port on the imp's own loopback. Run it in the imp with Bun:
// `bun relay-forward.ts <listen_port> <target_port>`.

export interface RelayForward {
  readonly port: number;
  readonly stop: () => void;
}

interface RelayState {
  upstream: Bun.Socket | null;
  readonly pending: Uint8Array[];
}

interface RelayForwardInput {
  readonly hostname: string;
  readonly listenPort: number;
  readonly targetPort: number;
}

export function startRelayForward(input: RelayForwardInput): RelayForward {
  const listener = Bun.listen<RelayState>({
    hostname: input.hostname,
    port: input.listenPort,
    socket: {
      open(client) {
        client.data = { upstream: null, pending: [] };

        void Bun.connect({
          hostname: '127.0.0.1',
          port: input.targetPort,
          socket: {
            open(upstream) {
              client.data.upstream = upstream;

              for (const chunk of client.data.pending) {
                upstream.write(chunk);
              }

              client.data.pending.length = 0;
            },
            data(_upstream, chunk) {
              client.write(chunk);
            },
            close() {
              client.end();
            },
            error() {
              client.end();
            },
            connectError() {
              client.end();
            },
          },
        });
      },
      data(client, chunk) {
        if (client.data.upstream === null) {
          client.data.pending.push(new Uint8Array(chunk));
        } else {
          client.data.upstream.write(chunk);
        }
      },
      close(client) {
        client.data.upstream?.end();
      },
      error(client) {
        client.data.upstream?.end();
      },
    },
  });

  return { port: listener.port, stop: () => listener.stop(true) };
}

if (import.meta.main) {
  const [listenPort, targetPort] = process.argv.slice(2).map(Number);

  if (listenPort === undefined || targetPort === undefined) {
    throw new Error('usage: relay-forward.ts <listen_port> <target_port>');
  }

  startRelayForward({ hostname: '0.0.0.0', listenPort, targetPort });
}
