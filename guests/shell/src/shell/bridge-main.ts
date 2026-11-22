import { connect, createServer } from 'node:net';

// Runs inside the network namespace of one command. The namespace holds only a loopback, so this
// process listens there and passes each connection to the proxy's Unix socket, which is the one way
// out. Arguments: the socket path, the loopback port, then the command and its arguments.
const [socketPath = '', portText = '', ...argv] = Bun.argv.slice(2);
const [command = 'true', ...args] = argv;
const lift = Bun.spawnSync(['ip', 'link', 'set', 'lo', 'up']);

if (lift.exitCode !== 0) {
  process.stderr.write(`could not bring the loopback up: ${lift.stderr.toString()}`);
  process.exit(126);
}

const bridge = createServer((client) => {
  const upstream = connect({ path: socketPath });

  client.on('error', () => {
    upstream.destroy();
  });

  upstream.on('error', () => {
    client.destroy();
  });

  client.pipe(upstream);
  upstream.pipe(client);
});

await new Promise<void>((resolve) => {
  bridge.listen(Number(portText), '127.0.0.1', () => {
    resolve();
  });
});

const child = Bun.spawn([command, ...args], {
  stdin: 'ignore',
  stdout: 'inherit',
  stderr: 'inherit',
});

await child.exited;

const exitCode = child.signalCode === null ? (child.exitCode ?? 1) : 137;

process.exit(exitCode);
