import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSocketProbeArgv } from './build-socket-probe-argv';

function setupTest() {
  const folder = mkdtempSync(join(tmpdir(), 'nixie-probe-'));

  onTestFinished(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  return {
    folder,
    runProbe: async (argv: readonly string[]) => {
      const child = Bun.spawn([...argv], { stdout: 'pipe', stderr: 'pipe' });

      const output = await new Response(child.stdout).text();

      return output.trim().split('\n');
    },
  };
}

test('it prints open for a Unix socket that listens and closed for a path that does not', async () => {
  const ctx = setupTest();
  const path = join(ctx.folder, 'listening.sock');
  const server = Bun.listen({ unix: path, socket: { data: () => {} } });

  onTestFinished(() => {
    server.stop(true);
  });

  const lines = await ctx.runProbe(
    buildSocketProbeArgv([
      { kind: 'unix', path },
      { kind: 'unix', path: join(ctx.folder, 'missing.sock') },
    ]),
  );

  expect(lines).toStrictEqual(['open', 'closed']);
});

test('it prints open for a TCP port that listens and closed for a port that refuses', async () => {
  const ctx = setupTest();
  const server = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => {} } });
  const closedServer = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => {} } });
  const closedPort = closedServer.port;

  closedServer.stop(true);

  onTestFinished(() => {
    server.stop(true);
  });

  const lines = await ctx.runProbe(
    buildSocketProbeArgv([
      { kind: 'tcp', host: '127.0.0.1', port: server.port },
      { kind: 'tcp', host: '127.0.0.1', port: closedPort },
    ]),
  );

  expect(lines).toStrictEqual(['open', 'closed']);
});

test('it prints closed for an abstract socket that nothing listens on', async () => {
  const ctx = setupTest();

  const lines = await ctx.runProbe(
    buildSocketProbeArgv([{ kind: 'abstract', name: '/tmp/.X11-unix/X991' }]),
  );

  expect(lines).toStrictEqual(['closed']);
});
