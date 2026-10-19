import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCLI } from './run-cli';
import { writeBootFiles } from './test-utils/write-boot-files';

// the boot files a deployment command reads, and the IO it prints and logs to
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-deployment-commands-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const files = await writeBootFiles(dir, 'http://127.0.0.1:9', { config: [], secrets: [] });

  return {
    ...files,
    io: {
      log: mock(),
      print: mock(),
      waitForSignal: () => Promise.withResolvers<string>().promise,
    },
  };
}

test('it prints each sandbox image with the name nixie gives it in impd', async () => {
  const ctx = await setupTest();
  const exitCode = await runCLI(['sandbox-manifest', '--manifest', ctx.manifestPath], ctx.io);

  expect(exitCode).toBe(0);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    [
      JSON.stringify({
        conversation: {
          name: 'nixie-conversation-cccccccccccc',
          ref: `ghcr.io/example/nixie-conversation@sha256:${'c'.repeat(64)}`,
        },
        fetch: {
          name: 'nixie-fetch-ffffffffffff',
          ref: `ghcr.io/example/nixie-fetch@sha256:${'f'.repeat(64)}`,
        },
      }),
    ],
  ]);
});

test('it exits 1 from sandbox-manifest on a manifest the server refuses', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.manifestPath, JSON.stringify({ fetch: 'ghcr.io/example/nixie-fetch:1' }));

  const exitCode = await runCLI(['sandbox-manifest', '--manifest', ctx.manifestPath], ctx.io);

  expect(exitCode).toBe(1);
  expect(ctx.io.print).not.toHaveBeenCalled();

  expect(ctx.io.log).toHaveBeenCalledExactlyOnceWith(
    'command.failed',
    expect.objectContaining({ command: 'sandbox-manifest' }),
  );
});

// a stand-in for the running server's health endpoints, on the port the configuration names
async function setupHealthTest() {
  const ctx = await setupTest();

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === '/health/live'
        ? Response.json({ status: 'ready', parts: { process: { isReady: true, reason: null } } })
        : Response.json({
            status: 'degraded',
            parts: { database: { isReady: true, reason: null } },
            dependencies: { imp_host: { isReady: false, reason: 'impd refused' } },
          }),
  });

  onTestFinished(() => server.stop(true));

  const config = await readFile(ctx.configPath, 'utf8');

  await writeFile(ctx.configPath, config.replace('  port: 0\n', `  port: ${server.port}\n`));

  return ctx;
}

test('it prints the readiness report and exits 1 from health when the server answers degraded', async () => {
  const ctx = await setupHealthTest();
  const exitCode = await runCLI(['health', '--config', ctx.configPath], ctx.io);

  expect(exitCode).toBe(1);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    [
      '{"status":"degraded","parts":{"database":{"isReady":true,"reason":null}},"dependencies":{"imp_host":{"isReady":false,"reason":"impd refused"}}}',
    ],
  ]);
});

test('it prints the liveness report and exits 0 from health --live when the server is live', async () => {
  const ctx = await setupHealthTest();
  const exitCode = await runCLI(['health', '--live', '--config', ctx.configPath], ctx.io);

  expect(exitCode).toBe(0);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    ['{"status":"ready","parts":{"process":{"isReady":true,"reason":null}}}'],
  ]);
});
