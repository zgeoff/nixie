import { expect, onTestFinished, test } from 'bun:test';
import type { NixieExit } from '@heynixie/testing';
import { readReleaseStartOutcome } from './read-release-start-outcome';

function setupTest() {
  const exited = Promise.withResolvers<NixieExit>();
  const listening = Promise.withResolvers<Readonly<Record<string, unknown>>>();

  const nixie = {
    waitForLogEvent: () => listening.promise,
    exited: exited.promise,
    readOutput: () => 'the output',
  };

  return { nixie, exited, listening };
}

test('it records a start with the ready status and body', async () => {
  const ctx = setupTest();

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: { '/health/ready': new Response('{"status":"degraded"}', { status: 200 }) },
  });

  onTestFinished(() => server.stop(true));

  ctx.listening.resolve({ port: server.port });

  const result = await readReleaseStartOutcome(ctx.nixie, { timeoutMs: 1000 });

  expect(result).toStrictEqual({
    outcome: 'started',
    readyStatus: 200,
    readyBody: '{"status":"degraded"}',
  });
});

test('it records a refusal when the process exits before it listens', async () => {
  const ctx = setupTest();

  ctx.listening.reject(new Error('nixie exited without the log event'));
  ctx.exited.resolve({ code: 1, signal: null });

  const result = await readReleaseStartOutcome(ctx.nixie, { timeoutMs: 1000 });

  expect(result).toStrictEqual({
    outcome: 'refused',
    exit: { code: 1, signal: null },
    output: 'the output',
  });
});

test('it throws with the output when the process neither listens nor exits', () => {
  const ctx = setupTest();

  expect(readReleaseStartOutcome(ctx.nixie, { timeoutMs: 50 })).rejects.toThrow(
    /within 50 ms:\nthe output/u,
  );
});
