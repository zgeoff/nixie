import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { startStubToolEndpoint } from './start-stub-tool-endpoint';

// The test preload's mock server drops fetch's unix option on the requests it passes through, so
// these tests reach the socket with curl, as a guest process does. curl runs in the socket's
// directory, because a temp path can pass the length a unix socket address holds.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-tool-endpoint-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it answers with the path and the bearer token it saw', async () => {
  const ctx = await setupTest();

  startStubToolEndpoint(join(ctx.dir, 'tools.sock'));

  const body: unknown =
    await $`curl -sS --unix-socket tools.sock -H ${'authorization: Bearer run-token'} http://localhost/mcp`
      .cwd(ctx.dir)
      .json();

  expect(body).toStrictEqual({ path: '/mcp', authorization: 'Bearer run-token' });
});

test('it answers a null token for a request without one', async () => {
  const ctx = await setupTest();

  startStubToolEndpoint(join(ctx.dir, 'tools.sock'));

  const body: unknown = await $`curl -sS --unix-socket tools.sock http://localhost/`
    .cwd(ctx.dir)
    .json();

  expect(body).toStrictEqual({ path: '/', authorization: null });
});

test('it stops listening when the test finishes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-tool-endpoint-'));

  startStubToolEndpoint(join(dir, 'tools.sock'));

  // hooks run first in, first out: the stub stops, this check runs, then the directory goes
  onTestFinished(async () => {
    const result = await $`curl -sS --unix-socket tools.sock http://localhost/`
      .cwd(dir)
      .nothrow()
      .quiet();

    // curl's exit code for a connection that reached no server
    expect(result.exitCode).toBe(7);
  });

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
});
