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
import { createAPIApp } from '../create-api-app';
import { defaultAPISettings } from '../default-api-settings';

// The lint cap on imports per file holds this file to ten, so these types come from the app's
// signature.
type APIContext = Parameters<typeof createAPIApp>[0];

type ViewMemoryStore = NonNullable<ReturnType<Parameters<typeof createAPIApp>[1]>>;

interface TestAPI {
  readonly dataDir: string;

  readonly setMemory: (store: ViewMemoryStore) => void;
  readonly writer: Writer;
  readonly clock: TestClock;
  readonly context: APIContext;

  readonly url: string;
}

export async function startTestAPI(): Promise<TestAPI> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(`${tmpdir()}/nixie-api-`);

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const context = await createTestContext(writer);

  const served = startTestApp(context);

  stack.defer(served.stop);

  return {
    dataDir,
    writer,
    clock: context.clock,
    context,
    url: served.url,
    setMemory: served.setMemory,
  };
}

async function createTestContext(
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

    readSessionCleanup: () => null,
  };

  await createConversationTask(context);

  return context;
}

function startTestApp(
  context: APIContext,
): Pick<TestAPI, 'url' | 'setMemory'> & { readonly stop: () => Promise<void> } {
  const memory: { store: ViewMemoryStore | null } = { store: null };
  const app = createAPIApp(context, () => memory.store).listen({ hostname: '127.0.0.1', port: 0 });

  return {
    stop: async () => {
      await app.stop(true);
    },
    url: `http://127.0.0.1:${app.server?.port}`,
    setMemory: (store) => {
      memory.store = store;
    },
  };
}
