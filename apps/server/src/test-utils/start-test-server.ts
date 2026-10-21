import { onTestFinished } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LogRecord } from '@heynixie/log';
import { readRecords, writeRecords } from '@heynixie/log';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import type { TasksContext } from '@heynixie/tasks';
import type { ToolDefinition, ToolEndpoint, ToolEndpointOptions } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildTestFakeSandboxes } from './build-test-fake-sandboxes';
import { createTestSandboxes } from './create-test-sandboxes';
import { startTestLog } from './start-test-log';

export interface TestServer {
  readonly dataDir: string;
  readonly context: TasksContext;
  readonly endpoint: ToolEndpoint;
  readonly sandboxes: SandboxAdapter;

  readonly socketDir: string;

  readonly retireSandboxes: (owner: string) => Promise<readonly string[]>;

  readonly defer: (stop: () => Promise<void>) => void;

  readonly readSandboxIDs: () => Promise<readonly string[]>;

  readonly readRecords: () => Promise<readonly LogRecord[]>;

  readonly writeOwnerMessages: (
    thread: string,
    texts: readonly string[],
  ) => Promise<readonly number[]>;
}

export interface TestServerTools {
  readonly definitions: readonly ToolDefinition[];
  readonly decide: ToolEndpointOptions['decide'];
}

export type BuildTestServerTools = (context: TasksContext) => TestServerTools;

export interface TestServerOptions {
  readonly fakeGuest?: boolean;
}

interface FakeGuestOptions {
  readonly fakeGuest: true;
}

export interface FakeGuestTestServer extends TestServer {
  readonly guest: StubGuestSandboxes;
}

export function startTestServer(
  tools: TestServerTools | BuildTestServerTools | undefined,
  options: FakeGuestOptions,
): Promise<FakeGuestTestServer>;

export function startTestServer(
  tools?: TestServerTools | BuildTestServerTools,
  options?: TestServerOptions,
): Promise<TestServer>;

export async function startTestServer(
  tools?: TestServerTools | BuildTestServerTools,
  options: TestServerOptions = {},
): Promise<TestServer | FakeGuestTestServer> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-server-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const context = {
    log,
    clock: log.writer.clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };

  const socketDir = join(dataDir, 'tools');

  const endpoint = await startTestToolEndpoint(context, socketDir, tools);

  stack.defer(() => endpoint.stop());

  const fake =
    options.fakeGuest === true
      ? buildTestFakeSandboxes({
          log: context.log,
          definitions: context.definitions,
          toolTarget: endpoint.getToolTarget,
        })
      : null;

  const sandboxes =
    fake ??
    createTestSandboxes({
      log: context.log,
      definitions: context.definitions,
      toolTarget: endpoint.getToolTarget,
      rootDir: join(dataDir, 'sandboxes'),
    });

  return {
    dataDir,
    context,
    endpoint,
    socketDir,
    ...sandboxes,
    defer: (stop) => {
      stack.defer(stop);
    },
    readSandboxIDs: () =>
      fake === null
        ? readdir(join(dataDir, 'sandboxes'))
        : Promise.resolve(fake.guest.readSandboxIDs()),
    readRecords: async () => {
      const entries = await readRecords(log, { afterSequence: 0, limit: 1000 });

      return entries.map((entry) => entry.record);
    },
    writeOwnerMessages: async (thread, texts) => {
      const records = await writeRecords(
        log,
        texts.map((text) => ({
          kind: 'owner_message',
          definitions: { snapshotHash: 'sha256:test' },
          thread,
          erasable: { text, spans: [{ start: 0, end: text.length, source: 'typed' }] },
        })),
      );

      return records.map((record) => record.sequence);
    },
  };
}

function startTestToolEndpoint(
  context: TasksContext,
  socketDir: string,
  given: TestServerTools | BuildTestServerTools | undefined,
): Promise<ToolEndpoint> {
  const tools = typeof given === 'function' ? given(context) : given;

  return startToolEndpoint({
    socketDir,
    registry: buildToolRegistry(tools?.definitions ?? []),
    decide:
      tools?.decide ??
      (() => ({
        decision: { outcome: 'deny', stage: 1, rule: null },
        sentence: 'No tool is registered.',
      })),
    log: context.log,
    definitions: context.definitions,

    queue: {
      enqueue: () => Promise.reject(new Error('every test tool runs direct, so nothing is queued')),
      waitForOutcome: () => Promise.resolve(null),
    },
  });
}
