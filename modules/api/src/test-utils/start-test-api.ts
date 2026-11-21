import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { actionsProjection } from '@heynixie/actions';
import { readDefinitionNotices, readDefinitionVersion } from '@heynixie/definitions';
import { definitionTaskProjections } from '@heynixie/definitions/test-utils';
import type { Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import { createPlanLoginsHolder, spendProjections } from '@heynixie/spend';
import { buildStubSpendGateway } from '@heynixie/spend/test-utils';
import type { ReadDefinitionVersion } from '@heynixie/tasks';
import { tasksProjections } from '@heynixie/tasks';
import type { TestDefinitionStore } from '@heynixie/tasks/test-utils';
import {
  buildTestDefinitionStore,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import type { FakeClock } from '@zgeoff/testing/clock';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { Kysely } from 'kysely';
import { apiProjections } from '../api/api-projections';
import { createAPIApp } from '../api/create-api-app';
import { createPasskeyState } from '../passkey/passkey-state';
import { proposalsProjection } from '../proposal/proposals-projection';
import type { CleanupRecordSessions } from '../types';
import { defaultAPISettings } from '../utils/default-api-settings';

type APIContext = Parameters<typeof createAPIApp>[0];

type ViewMemoryStore = NonNullable<ReturnType<Parameters<typeof createAPIApp>[1]>>;

interface TestAPI {
  readonly dataDir: string;

  readonly setMemory: (store: ViewMemoryStore) => void;

  // the session cleanup that a running nixie gives a record forget once memory starts
  readonly setSessionCleanup: (cleanup: CleanupRecordSessions) => void;
  readonly writer: Writer;
  readonly clock: FakeClock;
  readonly context: APIContext;
  readonly definitionStore: TestDefinitionStore;

  // the stub gateway, which the context holds only when the test turns the spending stop on
  readonly spendGateway: ReturnType<typeof buildStubSpendGateway>;

  readonly url: string;
}

interface TestAPIOptions {
  // gives the context a spending stop on a stub gateway, with turn limits of 3 a day (cap 5) and 4 a month
  readonly isSpendOn?: boolean;
}

export async function startTestAPI(
  settings: APIContext['settings'] = defaultAPISettings,
  options: TestAPIOptions = {},
): Promise<TestAPI> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(`${tmpdir()}/nixie-api-`);

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const definitionStore = buildTestDefinitionStore();
  const sessions: { cleanup: CleanupRecordSessions | null } = { cleanup: null };
  const spendGateway = buildStubSpendGateway();

  const context = await createTestContext(writer, settings, definitionStore, {
    readSessionCleanup: () => sessions.cleanup,
    spendGateway: options.isSpendOn === true ? spendGateway : null,
  });

  const served = startTestApp(context);

  stack.defer(served.stop);

  return {
    dataDir,
    writer,
    clock: context.clock,
    context,
    spendGateway,
    definitionStore,
    url: served.url,
    setMemory: served.setMemory,
    setSessionCleanup: (cleanup) => {
      sessions.cleanup = cleanup;
    },
  };
}

interface TestContextDeps {
  readonly readSessionCleanup: APIContext['readSessionCleanup'];
  readonly spendGateway: ReturnType<typeof buildStubSpendGateway> | null;
}

async function createTestContext(
  writer: Writer,
  settings: APIContext['settings'],
  definitionStore: TestDefinitionStore,
  deps: TestContextDeps,
): Promise<APIContext & { readonly clock: FakeClock }> {
  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const readStoredVersion: ReadDefinitionVersion = async (db, hash) => {
    const stored = await readDefinitionVersion(db, hash);

    return stored ?? definitionStore.readDefinitionVersion(db, hash);
  };

  const log = {
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
      ...spendProjections,
    ],
  };

  const context = {
    log,
    clock: createFakeClock({ startMs: 1_000_000 }),
    definitions: readTestDefinitions,
    ...(deps.spendGateway === null
      ? {}
      : {
          spend: {
            gateway: deps.spendGateway,
            log,
            clock: writer.clock,
            zone: 'UTC',
            limits: { dayTurns: 3, dayTurnCap: 5, monthTurns: 4 },
            definitions: readTestDefinitions,
            planLogins: createPlanLoginsHolder(),
          },
        }),
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
    readSessionCleanup: deps.readSessionCleanup,
  };

  return context;
}

function readTestDefinitions() {
  return { snapshotHash: 'sha256:test' };
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
