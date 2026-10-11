import { expect, onTestFinished, test } from 'bun:test';
import { buildConnectProbe } from './build-connect-probe';

test('it prints connected for a port that accepts the connection', async () => {
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data: (socket) => {
        socket.end();
      },
    },
  });
  onTestFinished(() => listener.stop(true));
  const probe = buildConnectProbe(process.execPath, '127.0.0.1', listener.port);

  const run = Bun.spawn([...probe.argv], { env: { ...probe.env }, stdout: 'pipe' });
  const output = await new Response(run.stdout).text();

  expect(output.trim()).toBe('connected');
});

test('it prints failed with the reason for a port where nothing listens', async () => {
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
  const probe = buildConnectProbe(process.execPath, '127.0.0.1', port);

  const run = Bun.spawn([...probe.argv], { env: { ...probe.env }, stdout: 'pipe' });
  const output = await new Response(run.stdout).text();

  expect(output.trim()).toStartWith('failed ');
});
