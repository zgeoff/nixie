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

  readonly sandboxes: SandboxAdapter;

  readonly socketDir: string;

  readonly defer: (stop: () => Promise<void>) => void;
}

export interface TestSessionHostOptions {
  readonly projections?: readonly Projection[];
}

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

  const adapter = createProcessSandboxAdapter({
    recorder: buildSandboxRecorder({ log, definitions: context.definitions }),
    rootDir: join(dataDir, 'sandboxes'),
    toolTarget: endpoint.getToolTarget,
    hostEnv: {},
  });

  const createdIDs = new Set<string>();

  stack.defer(() => removeSandboxes(adapter, createdIDs));

  return {
    dataDir,
    context,
    sandboxes: {
      ...adapter,
      create: async (spec) => {
        const sandbox = await adapter.create(spec);

        createdIDs.add(sandbox.id);

        return sandbox;
      },
    },
    socketDir,
    defer: (stop) => {
      stack.defer(stop);
    },
  };
}

async function removeSandboxes(
  adapter: SandboxAdapter,
  createdIDs: ReadonlySet<string>,
): Promise<void> {
  const sandboxes = await Promise.all([...createdIDs].map((id) => adapter.read(id)));

  const live = sandboxes.filter((sandbox) => sandbox !== null);

  await Promise.all(live.map((sandbox) => sandbox.destroy()));
}
