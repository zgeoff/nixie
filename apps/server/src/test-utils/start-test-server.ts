import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDecisionPoint } from '@heynixie/policy';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { systemClock } from '@heynixie/tasks';
import type { ToolEndpoint } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildSandboxAdapter } from '../build-sandbox-adapter';
import { startTestLog } from './start-test-log';

export interface TestServer {
  readonly dataDir: string;
  readonly context: TasksContext;
  readonly endpoint: ToolEndpoint;
  readonly sandboxes: SandboxAdapter;

  // stops a part the test starts on the server before the server's own parts stop
  readonly defer: (stop: () => Promise<void>) => void;
}

// Starts the parts of a test build the conversation runs on: a writer on a fresh data directory, a
// tool endpoint with no tools, and the process double that runs each guest as a local process. It
// stops them, after every part the test deferred, when the test finishes.
export async function startTestServer(): Promise<TestServer> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-server-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const context = {
    log,
    clock: systemClock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };
  const endpoint = await startEmptyToolEndpoint(context, join(dataDir, 'tools'));

  stack.defer(() => endpoint.stop());

  return {
    dataDir,
    context,
    endpoint,
    sandboxes: buildSandboxAdapter({
      recorder: buildSandboxRecorder({ log: context.log, definitions: context.definitions }),
      toolTarget: endpoint.getToolTarget,
      imp: { url: 'http://127.0.0.1:7070', publicEgress: null, token: 'impd-token' },
      testRootDir: join(dataDir, 'sandboxes'),
    }),
    defer: (stop) => {
      stack.defer(stop);
    },
  };
}

function startEmptyToolEndpoint(context: TasksContext, socketDir: string): Promise<ToolEndpoint> {
  return startToolEndpoint({
    socketDir,
    registry: buildToolRegistry([]),
    decide: makeDecisionPoint({ findDeclaration: () => null }),
    log: context.log,
    definitions: context.definitions,

    // no tool is registered, so nothing reaches the queue
    queue: {
      enqueue: () => Promise.reject(new Error('no tool is registered, so nothing is queued')),
      waitForOutcome: () => Promise.resolve(null),
    },
  });
}
