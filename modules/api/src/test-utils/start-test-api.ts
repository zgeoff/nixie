import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { actionsProjection } from '@heynixie/actions';
import { readDefinitionNotices, readDefinitionVersion } from '@heynixie/definitions';
import { definitionTaskProjections } from '@heynixie/definitions/test-utils';
import type { Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import type { ReadDefinitionVersion } from '@heynixie/tasks';
import { tasksProjections } from '@heynixie/tasks';
import type { TestDefinitionStore } from '@heynixie/tasks/test-utils';
import {
  buildTestDefinitionStore,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
import { triggersProjections } from '@heynixie/triggers';
import type { Kysely } from 'kysely';
import { apiProjections } from '../api/api-projections';
import { createAPIApp } from '../api/create-api-app';
import { createPasskeyState } from '../passkey/passkey-state';
import { proposalsProjection } from '../proposal/proposals-projection';
import { defaultAPISettings } from '../utils/default-api-settings';

type APIContext = Parameters<typeof createAPIApp>[0];

type ViewMemoryStore = NonNullable<ReturnType<Parameters<typeof createAPIApp>[1]>>;

interface TestAPI {
  readonly dataDir: string;

  readonly setMemory: (store: ViewMemoryStore) => void;
  readonly writer: Writer;
  readonly clock: TestClock;
  readonly context: APIContext;
  readonly definitionStore: TestDefinitionStore;

  readonly url: string;
}

export async function startTestAPI(
  settings: APIContext['settings'] = defaultAPISettings,
): Promise<TestAPI> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(`${tmpdir()}/nixie-api-`);

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const definitionStore = buildTestDefinitionStore();

  const context = await createTestContext(writer, settings, definitionStore);

  const served = startTestApp(context);

  stack.defer(served.stop);

  return {
    dataDir,
    writer,
    clock: context.clock,
    context,
    definitionStore,
    url: served.url,
    setMemory: served.setMemory,
  };
}

async function createTestContext(
  writer: Writer,
  settings: APIContext['settings'],
  definitionStore: TestDefinitionStore,
): Promise<APIContext & { readonly clock: TestClock }> {
  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const readStoredVersion: ReadDefinitionVersion = async (db, hash) => {
    const stored = await readDefinitionVersion(db, hash);

    return stored ?? definitionStore.readDefinitionVersion(db, hash);
  };

  const context = {
    log: {
      writer,
      deploymentKey,
      projections: [
        ...logProjections,
        ...tasksProjections,
        ...definitionTaskProjections,
        actionsProjection,
        ...apiProjections,
        ...memoryProjections,
        proposalsProjection,
        ...triggersProjections,
      ],
    },
    clock: buildTestClock(1_000_000),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    runSettings: buildTestRunSettings(),
    readDefinitionNotices: (db: Kysely<unknown>, changeIDs: readonly string[]) =>
      readDefinitionNotices(db, changeIDs, {
        now: writer.clock.now(),
        readZone: () => Promise.resolve('UTC'),
      }),
    readDefinitionRunPolicy: definitionStore.readDefinitionRunPolicy,
    readDefinitionNextFire: definitionStore.readDefinitionNextFire,
    readDefinitionVersion: readStoredVersion,
    runners: buildTestTaskRunners(),
    settings,
    passkeys: createPasskeyState(),

    readZone: () => Promise.resolve('UTC'),
    readSessionCleanup: () => null,
  };

  return context;
}

function startTestApp(
  context: APIContext,
): Pick<TestAPI, 'url' | 'setMemory'> & { readonly stop: () => Promise<void> } {
  const memory: { store: ViewMemoryStore | null } = { store: null };

  // The device API's tests check the answer, and the definitions' own tests check the seed after it.
  const app = createAPIApp(
    context,
    () => memory.store,
    () => Promise.resolve(),
    () => null,
  ).listen({
    hostname: '127.0.0.1',
    port: 0,
  });

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
