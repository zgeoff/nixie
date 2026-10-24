import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countTextTokens } from '@heynixie/compaction';
import type { Log, Projection } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { buildSandboxRecorder, sandboxesProjection } from '@heynixie/sandbox';
import type { ReceivedFrame, StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import { buildStubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import type { TasksContext } from '@heynixie/tasks';
import { tasksProjections } from '@heynixie/tasks';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { readTestToolNames, sendTestToolCall } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';

interface TestToolResult {
  readonly name: string;

  readonly result: string;
}

export interface TestSessionHost {
  readonly dataDir: string;
  readonly context: TasksContext;

  readonly sandboxes: SandboxAdapter;
  readonly guest: StubGuestSandboxes;

  readonly toolResults: readonly TestToolResult[];

  readonly readToolNames: (received: ReceivedFrame) => Promise<readonly string[]>;

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

  const toolResults: TestToolResult[] = [];

  const guest = buildStubGuestSandboxes({
    recorder: buildSandboxRecorder({ log, definitions: context.definitions }),
    callTool: async (call) => {
      const result = await sendTestToolCall({
        target: endpoint.getToolTarget({ id: call.sandboxID, owner: call.owner }),
        token: call.token,
        name: call.name,
        input: call.input,
      });

      toolResults.push({ name: call.name, result });

      return result;
    },
    countTokens: countTextTokens,
  });

  return {
    dataDir,
    context,
    sandboxes: guest.adapter,
    guest,
    toolResults,
    readToolNames: (received) => {
      invariant(received.frame.type === 'turn', 'only a turn frame carries a tool route');

      return readTestToolNames({
        target: endpoint.getToolTarget({ id: received.sandboxID, owner: received.owner }),
        token: received.frame.tools.token,
      });
    },
    socketDir,
    defer: (stop) => {
      stack.defer(stop);
    },
  };
}
