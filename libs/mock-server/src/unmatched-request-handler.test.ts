import { expect, mock, onTestFinished, spyOn, test } from 'bun:test';

test('it refuses an unmatched request to another host', () => {
  expect(fetch('https://lighthouse.example/beam')).rejects.toThrow('Failed to fetch');
});

test('it lets a loopback request through to its server', async () => {
  const answerRequest = mock(() => new Response('beam'));
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: answerRequest });

  onTestFinished(() => server.stop(true));

  const response = await fetch(server.url);
  const text = await response.text();

  expect(text).toBe('beam');
});

test('it lets a fetch of a data URL through to its contents without an error', async () => {
  const consoleError = spyOn(console, 'error');

  onTestFinished(() => {
    consoleError.mockRestore();
  });

  const response = await fetch('data:text/plain;base64,aGFyYm91cg==');
  const text = await response.text();

  expect(text).toBe('harbour');
  expect(consoleError).not.toHaveBeenCalled();
});
