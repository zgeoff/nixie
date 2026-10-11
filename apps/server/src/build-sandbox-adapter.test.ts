import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logProjections, startWriter } from '@heynixie/log';
import { makeDecisionPoint } from '@heynixie/policy';
import type { SandboxRecorder } from '@heynixie/sandbox';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildSandboxAdapter } from './build-sandbox-adapter';

const entry = join(import.meta.dir, 'index.ts');

// a string only the process double holds, and one only the imp adapter holds
const processMarker = 'the tool relay has no TCP address';
const impMarker = 'public egress without the host addresses in IMP_HOST_ADDRESSES';

async function buildBundle(isTestBuild: boolean): Promise<string> {
  const outdir = await mkdtemp(join(tmpdir(), 'nixie-server-bundle-'));

  onTestFinished(() => rm(outdir, { recursive: true, force: true }));

  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    target: 'bun',
    define: { NIXIE_TEST_BUILD: String(isTestBuild) },
  });

  if (!result.success) {
    throw new AggregateError(result.logs, 'the bundle failed');
  }
  const texts = await Promise.all(result.outputs.map((output) => output.text()));

  return texts.join('\n');
}

test('a test build wires the process double', () => {
  const recorder: SandboxRecorder = {
    write: () => Promise.resolve(),
    findRow: () => Promise.resolve(null),
    list: () => Promise.resolve([]),
  };
  const adapter = buildSandboxAdapter({
    recorder,
    toolTarget: () => ({ path: '/nonexistent.sock' }),
    env: {},
    testRootDir: tmpdir(),
  });

  expect(adapter).toMatchObject({ id: 'process', boundary: 'process' });
});

test('the release bundle holds the imp adapter and no part of the process double', async () => {
  const release = await buildBundle(false);
  const testBuild = await buildBundle(true);

  expect(release).toContain(impMarker);
  expect(release).not.toContain(processMarker);
  expect(testBuild).toContain(processMarker);
});

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-server-tools-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
  const endpoint = await startToolEndpoint({
    socketDir: join(dataDir, 'tools'),
    registry: buildToolRegistry([]),
    decide: makeDecisionPoint({ findDeclaration: () => null }),
    log: { writer, deploymentKey, projections: logProjections },
    definitions: () => ({ snapshotHash: 'sha256:test' }),

    // no test here calls a tool, so nothing reaches the queue
    queue: { enqueue: () => Promise.resolve(), waitForOutcome: () => Promise.resolve(null) },
  });

  stack.defer(() => endpoint.stop());

  return {
    endpoint,
    adapter: buildSandboxAdapter({
      recorder: {
        write: () => Promise.resolve(),
        findRow: () => Promise.resolve(null),
        list: () => Promise.resolve([]),
      },
      toolTarget: endpoint.getToolTarget,
      env: {},
      testRootDir: dataDir,
    }),
  };
}

test("a test build's tool route takes a guest to its run's endpoint and passes each chunk as it arrives", async () => {
  const ctx = await setupTest();
  const run = await ctx.endpoint.startRun({ runID: 'run-1', thread: 'task-1', tools: [] });
  const sandbox = await ctx.adapter.create({
    kind: 'conversation',
    image: 'conversation',
    owner: 'run-1',
    egress: { kind: 'none' },
    grants: [],
    toolRoute: true,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => sandbox.destroy());

  const route = await sandbox.toolRoute();

  // Bun.fetch, because the test preload's request interceptor would sit between the test and the
  // relay; the listen stream stays open, so its first chunk shows the relay does not buffer
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
