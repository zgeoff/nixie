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
      log: () => {},
    }),
  ).toReject();
  expect(send).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalled();
});

test('it logs the spawn, reply, CLI and API times of an answered check', async () => {
  const exit = {
    code: 0,
    signal: null,
    stderr: { bytes: new Uint8Array(), totalBytes: 0, isCut: false },
  };
  const reply = { kind: 'answer', output: {}, costUSD: 0.003, durationMs: 2400.4, apiMs: 2100.6 };
  const log = mock();

  await runSandboxCheck({
    sandbox: {
      spawn: () =>
        Promise.resolve({
          messages: new ReadableStream<Uint8Array<ArrayBuffer>>({
            start: (stream) => {
              stream.enqueue(new TextEncoder().encode(JSON.stringify(reply)));
              stream.close();
            },
          }),
          send: () => Promise.resolve(),
          exit: Promise.resolve(exit),
          stop: () => Promise.resolve(exit),
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
    signal: new AbortController().signal,
    log,
  });

  expect(log).toHaveBeenCalledExactlyOnceWith('checker.timed', {
    outcome: 'answer',
    spawnMs: expect.toBeNumber(),
    replyMs: expect.toBeNumber(),
    cliMs: 2400,
    apiMs: 2101,
    totalMs: expect.toBeNumber(),
  });
});

test('it logs an aborted check with no reply, CLI or API time', async () => {
  const exit = {
    code: null,
    signal: 'SIGTERM',
    stderr: { bytes: new Uint8Array(), totalBytes: 0, isCut: false },
  };
  const controller = new AbortController();
  const log = mock();

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
            send: () => Promise.resolve(),
            exit: Promise.resolve(exit),
            stop: () => Promise.resolve(exit),
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
      log,
    }),
  ).toReject();

  expect(log).toHaveBeenCalledExactlyOnceWith('checker.timed', {
    outcome: 'aborted',
    spawnMs: expect.toBeNumber(),
    replyMs: null,
    cliMs: null,
    apiMs: null,
    totalMs: expect.toBeNumber(),
  });
});

test('it logs a check whose guest exited with no reply', async () => {
  const exit = {
    code: 1,
    signal: null,
    stderr: { bytes: new Uint8Array(), totalBytes: 0, isCut: false },
  };
  const log = mock();

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
            send: () => Promise.resolve(),
            exit: Promise.resolve(exit),
            stop: () => Promise.resolve(exit),
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
      signal: new AbortController().signal,
      log,
    }),
  ).toReject();

  expect(log).toHaveBeenCalledExactlyOnceWith('checker.timed', {
    outcome: 'no_reply',
    spawnMs: expect.toBeNumber(),
    replyMs: null,
    cliMs: null,
    apiMs: null,
    totalMs: expect.toBeNumber(),
  });
});
