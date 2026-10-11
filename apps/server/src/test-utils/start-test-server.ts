import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { makeDecisionPoint } from '@heynixie/policy';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { buildSandboxRecorder, sandboxesProjection } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { systemClock, tasksProjections } from '@heynixie/tasks';
import type { ToolEndpoint } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildSandboxAdapter } from '../build-sandbox-adapter';

export interface TestServer {
  readonly dataDir: string;
  readonly context: TasksContext;
  readonly endpoint: ToolEndpoint;
  readonly sandboxes: SandboxAdapter;
}

// Starts the parts of a test build the conversation runs on: a writer on a fresh data directory
// with the log's, the tasks and the sandboxes projections, a tool endpoint with no tools, and the
// process double that runs each guest as a local process. It stops them when the test finishes.
export async function startTestServer(): Promise<TestServer> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-server-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const context = {
    log: await buildTestLog(writer),
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
      env: {},
      testRootDir: join(dataDir, 'sandboxes'),
    }),
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

async function buildTestLog(writer: Log['writer']): Promise<Log> {
  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    writer,
    deploymentKey,
    projections: [...logProjections, ...tasksProjections, sandboxesProjection],
  };
}
