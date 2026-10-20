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

  // the directory of the endpoint's run sockets, where a system task's own endpoint opens its run
  readonly socketDir: string;

  // retires every sandbox the owner holds, so the owner replaces it, and returns their IDs
  readonly retireSandboxes: (owner: string) => Promise<readonly string[]>;

  // stops a part the test starts on the server before the server's own parts stop
  readonly defer: (stop: () => Promise<void>) => void;

  // the ID of each sandbox whose disk the process double holds
  readonly readSandboxIDs: () => Promise<readonly string[]>;

  // the first 1,000 records of the log, oldest first
  readonly readRecords: () => Promise<readonly LogRecord[]>;

  // records your messages on the thread, oldest first and each typed in full, outside any inbox,
  // and returns their sequences
  readonly writeOwnerMessages: (
    thread: string,
    texts: readonly string[],
  ) => Promise<readonly number[]>;
}

// the direct tools the endpoint serves and the decision point each of their calls passes
export interface TestServerTools {
  readonly definitions: readonly ToolDefinition[];
  readonly decide: ToolEndpointOptions['decide'];
}

// Builds the endpoint's tools from the server's own context, for a tool such as the log reader that
// needs the log the server starts.
export type BuildTestServerTools = (context: TasksContext) => TestServerTools;

export interface TestServerOptions {
  // runs the conversation on the stateful fake guest in place of the process double, and returns it
  // on the server as guest
  readonly fakeGuest?: boolean;
}

interface FakeGuestOptions {
  readonly fakeGuest: true;
}

export interface FakeGuestTestServer extends TestServer {
  readonly guest: StubGuestSandboxes;
}

// Starts the parts of a test build the conversation runs on: a writer on a fresh data directory, a
// tool endpoint with the tools given or built, or none, and the process double whose sandboxes a
// test can retire, or the fake guest when asked. It stops them, after every part the test deferred.
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

    // every tool a test registers runs direct, so nothing reaches the queue
    queue: {
      enqueue: () => Promise.reject(new Error('every test tool runs direct, so nothing is queued')),
      waitForOutcome: () => Promise.resolve(null),
    },
  });
}
