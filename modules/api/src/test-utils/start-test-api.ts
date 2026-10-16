import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import { createConversationTask, tasksProjections } from '@heynixie/tasks';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
import { apiProjections } from '../api-projections';
import { buildAPIApp } from '../build-api-app';
import { defaultAPISettings } from '../default-api-settings';

// the context and the memory store the app takes, named from its signature to keep the file's
// imports to ten
type APIContext = Parameters<typeof buildAPIApp>[0];

type ViewMemoryStore = NonNullable<ReturnType<Parameters<typeof buildAPIApp>[1]>>;

interface TestAPI {
  readonly dataDir: string;

  // fills the memory store the memory view's procedures reach, which no test API holds at its start
  readonly setMemory: (store: ViewMemoryStore) => void;
  readonly writer: Writer;
  readonly clock: TestClock;
  readonly context: APIContext;

  // the API's origin on a loopback port, such as http://127.0.0.1:41234
  readonly url: string;
}

// Starts the API on a fresh data directory and a loopback port, with memory's projections, the
// conversation's task, a test clock at 1,000,000 ms, the default settings and no session cleanup.
// When the test finishes it stops the server and the writer, then removes the directory.
export async function startTestAPI(): Promise<TestAPI> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(`${tmpdir()}/nixie-api-`);

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const context = await buildTestContext(writer);

  const served = startTestApp(context, stack);

  return { dataDir, writer, clock: context.clock, context, ...served };
}

async function buildTestContext(
  writer: Writer,
): Promise<APIContext & { readonly clock: TestClock }> {
  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const context = {
    log: {
      writer,
      deploymentKey,
      projections: [
        ...logProjections,
        ...tasksProjections,
        ...apiProjections,
        ...memoryProjections,
      ],
    },
    clock: buildTestClock(1_000_000),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    settings: defaultAPISettings,

    // no conversation runs beside the API, so a record forget leaves its session cleanup to a test
    readSessionCleanup: () => null,
  };

  await createConversationTask(context);

  return context;
}

// listens on a loopback port and serves the memory store once the test sets one
function startTestApp(
  context: APIContext,
  stack: AsyncDisposableStack,
): Pick<TestAPI, 'url' | 'setMemory'> {
  const memory: { store: ViewMemoryStore | null } = { store: null };
  const app = buildAPIApp(context, () => memory.store).listen({ hostname: '127.0.0.1', port: 0 });

  stack.defer(async () => {
    await app.stop(true);
  });

  return {
    url: `http://127.0.0.1:${app.server?.port}`,
    setMemory: (store) => {
      memory.store = store;
    },
  };
}
