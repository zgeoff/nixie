import { expect, onTestFinished, test } from 'bun:test';
import { connect } from 'node:tls';
import { startResettingSite } from './start-resetting-site';

test('it completes the TLS handshake and closes the connection once a request arrives', async () => {
  const site = await startResettingSite(['site.test']);

  const socket = connect({
    host: '127.0.0.1',
    port: site.port,
    servername: 'site.test',
    ca: site.ca,
  });

  const events: string[] = [];
  const closed = Promise.withResolvers<void>();

  socket.on('secureConnect', () => {
    events.push('secureConnect');
    socket.write('GET / HTTP/1.1\r\nhost: site.test\r\n\r\n');
  });

  socket.on('data', () => {
    events.push('data');
  });

  socket.on('error', () => {
    events.push('error');
  });

  socket.on('close', () => {
    closed.resolve();
  });

  await closed.promise;

  expect(events.filter((event) => event !== 'error')).toStrictEqual(['secureConnect']);
});

test('it stops the site when the test finishes', async () => {
  const site = await startResettingSite(['site.test']);

  onTestFinished(async () => {
    const socket = connect({ host: '127.0.0.1', port: site.port, ca: site.ca });
    const outcome = Promise.withResolvers<string>();

    socket.on('error', (error: NodeJS.ErrnoException) => {
      outcome.resolve(error.code ?? '');
    });

    socket.on('secureConnect', () => {
      socket.destroy();
      outcome.resolve('connected');
    });

    const code = await outcome.promise;

    expect(code).toBe('ECONNREFUSED');
  });
});
