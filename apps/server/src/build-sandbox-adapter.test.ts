import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import { buildSandboxAdapter } from './build-sandbox-adapter';
import { startTestServer } from './test-utils/start-test-server';

// The parts of a test build that the adapter wires to, from the test server. The stack's disposal
// registers before the server's, and onTestFinished runs first in, first out, so a sandbox that a
// test registers on it is destroyed while the writer that its recorder writes through still runs.
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const server = await startTestServer();

  return { stack, ...server };
}

test('it wires the process double in a test build', async () => {
  const ctx = await setupTest();

  const adapter = buildSandboxAdapter({
    recorder: buildSandboxRecorder({
      log: ctx.context.log,
      definitions: ctx.context.definitions,
    }),
    toolTarget: ctx.endpoint.getToolTarget,
    imp: { url: 'http://127.0.0.1:7070', publicEgress: null, token: 'impd-token' },
    testRootDir: join(ctx.dataDir, 'sandboxes'),
  });

  expect(adapter).toMatchObject({ id: 'process', boundary: 'process' });
});

test('it bundles the imp adapter and no part of the process double in a release build', async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, 'index.ts')],
    target: 'bun',
    define: { NIXIE_TEST_BUILD: 'false' },
  });
  const texts = await Promise.all(build.outputs.map((output) => output.text()));
  const bundle = texts.join('\n');

  // a string only the imp adapter holds, and one only the process double holds
  expect(bundle).toInclude('public egress without the host addresses in imp.host_addresses');
  expect(bundle).not.toInclude('the tool relay has no TCP address');
});

test('it bundles the process double in a test build', async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, 'index.ts')],
    target: 'bun',
    define: { NIXIE_TEST_BUILD: 'true' },
  });
  const texts = await Promise.all(build.outputs.map((output) => output.text()));

  // a string only the process double holds
  expect(texts.join('\n')).toInclude('the tool relay has no TCP address');
});

test("it routes a guest to its run's endpoint in a test build, passing each chunk as it arrives", async () => {
  const ctx = await setupTest();
  const model = { model: 'model-a', profile: 'chat-direct' };
  const run = await ctx.endpoint.startRun({ runID: 'run-1', thread: 'task-1', tools: [], model });
  const sandbox = await ctx.sandboxes.create({
    kind: 'conversation',
    image: 'conversation',
    owner: 'run-1',
    egress: { kind: 'none' },
    grants: [],
    toolRoute: true,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  ctx.stack.defer(() => sandbox.destroy());

  const route = await sandbox.toolRoute();

  // Bun.fetch skips the preload's interceptor; the open stream's first chunk shows no buffering
  const response = await Bun.fetch(`${route?.url ?? ''}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${run.token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-method': 'subscriptions/listen',
      'mcp-protocol-version': '2026-07-28',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'subscriptions/listen',
      params: {
        notifications: { toolsListChanged: true },
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'claude-code', version: '2.1.293' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
  const first = await response.body?.pipeThrough(new TextDecoderStream()).getReader().read();

  expect(first?.done).toBeFalse();
  expect(first?.value).toInclude('notifications/subscriptions/acknowledged');
});
