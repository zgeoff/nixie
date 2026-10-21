import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { startStubToolEndpoint } from './start-stub-tool-endpoint';

// The test preload's mock server drops fetch's unix option, so these tests reach the socket with
// curl. curl runs in the socket's directory, because a temp path can pass the length limit of a
// unix socket address.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-tool-endpoint-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it answers with the path and the bearer token it saw', async () => {
  const ctx = await setupTest();

  startStubToolEndpoint(join(ctx.directory, 'tools.sock'));

  const body: unknown =
    await $`curl -sS --unix-socket tools.sock -H ${'authorization: Bearer run-token'} http://localhost/mcp`
      .cwd(ctx.directory)
      .json();

  expect(body).toStrictEqual({ path: '/mcp', authorization: 'Bearer run-token' });
});

test('it answers a null token for a request without one', async () => {
  const ctx = await setupTest();

  startStubToolEndpoint(join(ctx.directory, 'tools.sock'));

  const body: unknown = await $`curl -sS --unix-socket tools.sock http://localhost/`
    .cwd(ctx.directory)
    .json();

  expect(body).toStrictEqual({ path: '/', authorization: null });
});

test('it stops listening when the test finishes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-tool-endpoint-'));

  startStubToolEndpoint(join(directory, 'tools.sock'));

  onTestFinished(async () => {
    const result = await $`curl -sS --unix-socket tools.sock http://localhost/`
      .cwd(directory)
      .nothrow()
      .quiet();

    expect(result.exitCode).toBe(7);
  });

  onTestFinished(() => rm(directory, { recursive: true, force: true }));
});
