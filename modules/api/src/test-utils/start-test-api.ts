import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { actionsProjection } from '@heynixie/actions';
import { budgetProjections } from '@heynixie/budgets';
import { callsProjection } from '@heynixie/calls';
import type { TestCallsContext, TestCallsOptions } from '@heynixie/calls/test-utils';
import { buildTestCallsContext } from '@heynixie/calls/test-utils';
import type { Clock } from '@heynixie/clock';
import type { ConnectionsPort } from '@heynixie/connections';
import { readDefinitionNotices, readDefinitionVersion } from '@heynixie/definitions';
import { definitionTaskProjections } from '@heynixie/definitions/test-utils';
import type { Writer } from '@heynixie/log';
import { logProjections, registerRecordTopics, startWriter } from '@heynixie/log';
import type { McpPort } from '@heynixie/mcp';
import { memoryProjections } from '@heynixie/memory';
import { notebookProjections } from '@heynixie/notebook';
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
import type { WatchSocketData } from '../computer/create-watch-route';
import { createWatchRoute } from '../computer/create-watch-route';
import { createWatchTickets } from '../computer/create-watch-tickets';
import { collectModuleRecordTopicMaps } from '../live/collect-module-record-topic-maps';
import { createClientRegistry } from '../live/create-client-registry';
import { createPasskeyState } from '../passkey/passkey-state';
import { proposalsProjection } from '../proposal/proposals-projection';
import type {
  CleanupRecordSessions,
  ComputerWatchPort,
  ErasureStuckPort,
  ViewNotebookStore,
} from '../types';
import { defaultAPISettings } from '../utils/default-api-settings';

type APIContext = Parameters<typeof createAPIApp>[0];

type ViewMemoryStore = NonNullable<ReturnType<Parameters<typeof createAPIApp>[1]>>;

interface TestAPI {
  readonly dataDir: string;

  readonly setMemory: (store: ViewMemoryStore) => void;

  readonly setNotebook: (store: ViewNotebookStore) => void;

  // the stuck forgets that a running nixie reads once its erasure runner starts
  readonly setErasure: (port: ErasureStuckPort) => void;

  // the Google connections that a running nixie sets once its connections start
  readonly setConnections: (port: ConnectionsPort) => void;

  // the MCP proxy that a running nixie sets once it starts
  readonly setMcp: (port: McpPort) => void;

  // the session cleanup that a running nixie gives a record forget once memory starts
  readonly setSessionCleanup: (cleanup: CleanupRecordSessions) => void;

  // the computer that a watch opens, which a running nixie sets once its computer starts
  readonly setWatch: (open: ReturnType<ComputerWatchPort['readWatch']>) => void;

  // the hold on the desktop that a device session takes, which a running nixie sets with its computer
  readonly setTakeover: (takeover: ReturnType<ComputerWatchPort['readTakeover']>) => void;

  // how many times a request has asked for the hold on the desktop, which says that it reached its
  // handler
  readonly readTakeoverCount: () => number;

  // every line the watch route and its relay logged
  readonly logged: readonly string[];
  readonly writer: Writer;
  readonly clock: FakeClock;
  readonly context: APIContext;
  readonly definitionStore: TestDefinitionStore;

  // the stub gateway, which the context holds only when the test turns the spending stop on
  readonly spendGateway: ReturnType<typeof buildStubSpendGateway>;

  // the calls context on a fake speech layer, which the context holds only when the test turns calls on
  readonly calls: TestCallsContext | null;

  readonly url: string;
}

interface TestAPIOptions {
  // gives the context a spending stop on a stub gateway, with turn limits of 3 a day (cap 5) and 4 a month
  readonly isSpendOn?: boolean;

  // makes the gateway the meter of each task run that opens
  readonly isGatewayMetered?: boolean;

  // the clock that the log's writer and the spending stop read, the system's when unset
  readonly writerClock?: Clock;

  // gives the context a calls module on a fake speech layer, set up as the options say
  readonly calls?: TestCallsOptions;
}

export async function startTestAPI(
  settings: APIContext['settings'] = defaultAPISettings,
  options: TestAPIOptions = {},
): Promise<TestAPI> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(`${tmpdir()}/nixie-api-`);

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({
    dataDir,
    ...(options.writerClock === undefined ? {} : { clock: options.writerClock }),
  });

  for (const topics of collectModuleRecordTopicMaps()) {
    registerRecordTopics(writer, topics);
  }

  stack.defer(() => writer.stop());

  const definitionStore = buildTestDefinitionStore();
  const sessions: { cleanup: CleanupRecordSessions | null } = { cleanup: null };
  const notebook: { store: ViewNotebookStore | null } = { store: null };
  const erasure: { port: ErasureStuckPort | null } = { port: null };
  const connections: { port: ConnectionsPort | null } = { port: null };
  const mcp: { port: McpPort | null } = { port: null };
  const spendGateway = buildStubSpendGateway();

  const watching: {
    open: ReturnType<ComputerWatchPort['readWatch']>;
    takeover: ReturnType<ComputerWatchPort['readTakeover']>;
    takeoverReads: number;
  } = { open: null, takeover: null, takeoverReads: 0 };

  const logged: string[] = [];

  const created = await createTestContext(writer, settings, definitionStore, {
    readSessionCleanup: () => sessions.cleanup,
    readNotebook: () => notebook.store,
    readErasure: () => erasure.port,
    readConnections: () => connections.port,
    readMcp: () => mcp.port,
    readWatch: () => watching.open,
    readTakeover: () => {
      watching.takeoverReads += 1;

      return watching.takeover;
    },
    logger: (event, fields) => {
      logged.push(JSON.stringify({ event, fields }));
    },
    spendGateway: options.isSpendOn === true ? spendGateway : null,
    isGatewayMetered: options.isGatewayMetered === true,
    calls: options.calls ?? null,
  });

  const context = created.context;
  const served = startTestApp(context);

  stack.defer(served.stop);

  return {
    dataDir,
    writer,
    clock: context.clock,
    context,
    spendGateway,
    calls: created.calls,
    definitionStore,
    url: served.url,
    setMemory: served.setMemory,
    setNotebook: (store) => {
      notebook.store = store;
    },
    setErasure: (port) => {
      erasure.port = port;
    },
    setConnections: (port) => {
      connections.port = port;
    },
    setMcp: (port) => {
      mcp.port = port;
    },
    setSessionCleanup: (cleanup) => {
      sessions.cleanup = cleanup;
    },
    setWatch: (open) => {
      watching.open = open;
    },
    setTakeover: (takeover) => {
      watching.takeover = takeover;
    },
    readTakeoverCount: () => watching.takeoverReads,
    logged,
  };
}

interface TestContextDeps {
  readonly readSessionCleanup: APIContext['readSessionCleanup'];
  readonly readNotebook: NonNullable<APIContext['readNotebook']>;
  readonly readErasure: NonNullable<APIContext['readErasure']>;
  readonly readConnections: NonNullable<APIContext['readConnections']>;
  readonly readMcp: NonNullable<APIContext['readMcp']>;
  readonly readWatch: ComputerWatchPort['readWatch'];
  readonly readTakeover: ComputerWatchPort['readTakeover'];
  readonly logger: ComputerWatchPort['logger'];
  readonly spendGateway: ReturnType<typeof buildStubSpendGateway> | null;
  readonly isGatewayMetered: boolean;
  readonly calls: TestCallsOptions | null;
}

async function createTestContext(
  writer: Writer,
  settings: APIContext['settings'],
  definitionStore: TestDefinitionStore,
  deps: TestContextDeps,
): Promise<{
  readonly context: APIContext & { readonly clock: FakeClock };
  readonly calls: TestCallsContext | null;
}> {
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
      ...notebookProjections,
      proposalsProjection,
      ...spendProjections,
      ...budgetProjections,
      callsProjection,
    ],
  };

  const calls =
    deps.calls === null ? null : buildTestCallsContext({ log, clock: writer.clock }, deps.calls);

  const clock = createFakeClock({ startMs: 1_000_000 });

  const context = {
    log,
    clock,
    logger: deps.logger,
    computerWatch: {
      tickets: createWatchTickets(clock),
      logger: deps.logger,
      readWatch: deps.readWatch,
      readTakeover: deps.readTakeover,
    },
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
            display: { currency: 'AUD', readRate: () => Promise.resolve(1.52) },
          },
        }),
    runSettings: buildTestRunSettings({ meter: deps.isGatewayMetered ? 'gateway' : 'records' }),
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
    clients: createClientRegistry({ clock }),

    readZone: () => Promise.resolve('UTC'),
    readSessionCleanup: deps.readSessionCleanup,
    readNotebook: deps.readNotebook,
    readErasure: deps.readErasure,
    ...(calls === null ? {} : { calls: calls.context }),
    readConnections: deps.readConnections,
    readMcp: deps.readMcp,
  };

  return { context, calls };
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
  );

  const route = createWatchRoute(context);

  const answerRequest = (
    request: Request,
    server: Bun.Server<WatchSocketData>,
  ): Promise<Response | undefined> | Promise<Response> =>
    route.isWatchRequest(request) ? route.upgrade(request, server) : app.handle(request);

  const server = Bun.serve<WatchSocketData>({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerRequest,
    websocket: route.websocket,
  });

  return {
    stop: async () => {
      await server.stop(true);
    },
    url: `http://127.0.0.1:${server.port}`,
    setMemory: (store) => {
      memory.store = store;
    },
  };
}
