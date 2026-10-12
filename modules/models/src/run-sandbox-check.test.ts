import { expect, mock, test } from 'bun:test';
import { runSandboxCheck } from './run-sandbox-check';

test('it stops the guest and sends no request when the timeout fired while the guest started', async () => {
  const exit = {
    code: null,
    signal: 'SIGTERM',
    stderr: { bytes: new Uint8Array(), totalBytes: 0, isCut: false },
  };
  const send = mock(() => Promise.resolve());
  const stop = mock(() => Promise.resolve(exit));
  const controller = new AbortController();

  controller.abort();

  await expect(
    runSandboxCheck({
      sandbox: {
        spawn: () =>
          Promise.resolve({
            messages: new ReadableStream<Uint8Array<ArrayBuffer>>({
              start: (stream) => {
                stream.close();
              },
            }),
            send,
            exit: Promise.resolve(exit),
            stop,
          }),
      },
      command: { argv: ['bun', 'check.ts'], env: {} },
      request: {
        profile: {
          model: 'claude-sonnet-5-5',
          baseURL: 'https://api.anthropic.com',
          effort: 'low',
          authHeader: 'x-api-key',
        },
        systemPrompt: 'You check one candidate memory.',
        input: 'the input',
      },
      signal: controller.signal,
    }),
  ).toReject();
  expect(send).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalled();
});
