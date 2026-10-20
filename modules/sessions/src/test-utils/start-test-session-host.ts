import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, Projection } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import type { SandboxAdapter } from '@heynixie/sandbox';
import {
  buildSandboxRecorder,
  createProcessSandboxAdapter,
  sandboxesProjection,
} from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { tasksProjections } from '@heynixie/tasks';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';

export interface TestSessionHost {
  readonly dataDir: string;
  readonly context: TasksContext;

  // the process double, which runs each guest from the workspace as a local process
  readonly sandboxes: SandboxAdapter;

  // the directory of the tool endpoint sockets, which the double's tool route resolves each
  // sandbox's owner in
  readonly socketDir: string;

  // stops a part the test starts on the host before the host's own parts stop
  readonly defer: (stop: () => Promise<void>) => void;
}

export interface TestSessionHostOptions {
  // the projections the log folds beside the log's, the tasks and the sandboxes projections
  readonly projections?: readonly Projection[];
}

// Starts what a system task's session runs on outside the server: a writer on a fresh data
// directory, and the process double, whose tool route reaches each run socket in the socket
// directory. It stops them, after every part the test deferred, then removes the directory.
export async function startTestSessionHost(
  options: TestSessionHostOptions = {},
): Promise<TestSessionHost> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-session-host-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log: Log = {
    writer,
    deploymentKey,
    projections: [
      ...logProjections,
      ...tasksProjections,
      sandboxesProjection,
      ...(options.projections ?? []),
    ],
  };

  const context: TasksContext = {
    log,
    clock: writer.clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };

  const socketDir = join(dataDir, 'tools');

  // an endpoint that serves no run, for the tool target of the run sockets each task's own
  // endpoint opens in the same directory
  const endpoint = await startToolEndpoint({
    socketDir,
    registry: buildToolRegistry([]),
    decide: () => ({
      decision: { outcome: 'deny', stage: 1, rule: null },
      sentence: 'No tool is registered.',
    }),
    log,
    definitions: context.definitions,
    queue: {
      enqueue: () => Promise.reject(new Error('the host serves no tool, so nothing is queued')),
      waitForOutcome: () => Promise.resolve(null),
    },
  });

  stack.defer(() => endpoint.stop());

  const sandboxes = createProcessSandboxAdapter({
    recorder: buildSandboxRecorder({ log, definitions: context.definitions }),
    rootDir: join(dataDir, 'sandboxes'),
    toolTarget: endpoint.getToolTarget,
    hostEnv: {},
  });

  return {
    dataDir,
    context,
    sandboxes,
    socketDir,
    defer: (stop) => {
      stack.defer(stop);
    },
  };
}
