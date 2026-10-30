import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-health-url-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const summaryPath = join(directory, 'summary');

  writeFileSync(summaryPath, '');

  return { summaryPath, scriptPath: join(import.meta.dir, 'check-health-url.ts') };
}

test('it writes the ready answer to the summary when both pages answer', async () => {
  const ctx = setupTest();

  const server = Bun.serve({
    port: 0,
    routes: {
      '/health/ready': new Response('{"status":"ready"}'),
      '/': new Response('<!doctype html>'),
    },
  });

  onTestFinished(() => server.stop(true));

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ ORIGIN: server.url.origin, GITHUB_STEP_SUMMARY: ctx.summaryPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe('{"status":"ready"}');
});

test('it fails, naming the URL, when nixie is not ready', async () => {
  const ctx = setupTest();

  const server = Bun.serve({
    port: 0,
    routes: {
      '/health/ready': new Response('{"status":"starting"}', { status: 503 }),
      '/': new Response('<!doctype html>'),
    },
  });

  onTestFinished(() => server.stop(true));

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ ORIGIN: server.url.origin, GITHUB_STEP_SUMMARY: ctx.summaryPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    `::error::${server.url.origin}/health/ready answered 503\n`,
  );

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe('');
});

test('it fails when the web client page answers with an error', async () => {
  const ctx = setupTest();

  const server = Bun.serve({
    port: 0,
    routes: {
      '/health/ready': new Response('{"status":"ready"}'),
      '/': new Response('Bad Gateway', { status: 502 }),
    },
  });

  onTestFinished(() => server.stop(true));

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ ORIGIN: server.url.origin, GITHUB_STEP_SUMMARY: ctx.summaryPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toEndWith(`::error::${server.url.origin}/ answered 502\n`);
});

test('it takes a redirect from the web client page as an answer', async () => {
  const ctx = setupTest();

  const server = Bun.serve({
    port: 0,
    routes: {
      '/health/ready': new Response('{"status":"ready"}'),
      '/': new Response(null, { status: 302, headers: { location: '/sign-in' } }),
    },
  });

  onTestFinished(() => server.stop(true));

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ ORIGIN: server.url.origin, GITHUB_STEP_SUMMARY: ctx.summaryPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});
