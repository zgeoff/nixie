// Option B, guest side: a CONNECT proxy on the guest's loopback that logs each target and the
// broker's answer, then relays to the broker named by HTTPS_PROXY, which imp exec sets.
// Usage: bun connect-log.ts <port>
import type { Socket } from 'bun';

interface State {
  header: string;
  upstream?: Socket<undefined>;
}

const broker = new URL(process.env.HTTPS_PROXY ?? ''),
  port = Number(process.argv[2]);

function printLine(text: string): void {
  console.log(`${new Date().toISOString()} ${text}`);
}

async function startUpstream(client: Socket<State>, head: string): Promise<void> {
  let answered = false;
  const target = head.split(' ')[1] ?? '?',
    upstream = await Bun.connect({
      hostname: broker.hostname,
      port: Number(broker.port),
      socket: {
        close: () => client.end(),
        data: (_socket, chunk) => {
          if (!answered) {
            answered = true;
            printLine(`CONNECT ${target} -> ${chunk.toString().split('\r\n')[0]}`);
          }
          client.write(chunk);
        },
        error: () => client.end(),
      },
    });
  client.data.upstream = upstream;
  upstream.write(head);
}

function sendHead(client: Socket<State>): void {
  const head = client.data.header;
  if (!head.startsWith('CONNECT ')) {
    printLine(`refused ${head.split('\r\n')[0]}`);
    client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
    return;
  }
  void startUpstream(client, head);
}

Bun.listen<State>({
  hostname: '127.0.0.1',
  port,
  socket: {
    close: (client) => client.data.upstream?.end(),
    data: (client, chunk) => {
      if (client.data.upstream) {
        client.data.upstream.write(chunk);
        return;
      }
      client.data.header += chunk.toString('latin1');
      if (client.data.header.includes('\r\n\r\n')) {
        sendHead(client);
      }
    },
    open: (client) => {
      client.data = { header: '' };
    },
  },
});
printLine(`connect-log on 127.0.0.1:${port}, relaying to ${broker.host}`);
