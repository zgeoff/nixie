import { connect } from 'node:net';

// Writes a raw request to a proxy and returns everything it sends back until the connection closes.
export function askProxy(port: number, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    let text = '';

    socket.on('data', (chunk) => {
      text += chunk.toString('latin1');
    });

    socket.once('error', reject);

    socket.once('close', () => {
      resolve(text);
    });

    socket.write(request);
  });
}
