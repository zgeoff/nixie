import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestAction } from '@heynixie/actions/test-utils';
import { readTestActions } from '@heynixie/actions/test-utils';
import type { TestBackupSet } from '@heynixie/backup/test-utils';
import { readTestBackupSets } from '@heynixie/backup/test-utils';
import { startDatabase } from '@heynixie/db';
import type { LogRecord, Writer } from '@heynixie/log';
import { getDataFilePath, parseJSONObject } from '@heynixie/log';
import { readTestRecordRows, readTestWriterEpoch } from '@heynixie/log/test-utils';
import type { LogLevel } from '@heynixie/logger';
import type { TestMemoryItem } from '@heynixie/memory/test-utils';
import { readTestMemoryItems } from '@heynixie/memory/test-utils';
import type { TestLease, TestTask, TestTimer } from '@heynixie/tasks/test-utils';
import { readTestLeases, readTestTasks, readTestTimers } from '@heynixie/tasks/test-utils';
import type {
  AdvanceOptions,
  CrashHarness,
  FaultPointArm,
  FaultPointArrival,
  NixieExit,
  NixieProcess,
  ProviderDouble,
  ScriptedModel,
} from '@heynixie/testing';
import {
  startCrashHarness,
  startNixieProcess,
  startProviderDouble,
  startScriptedModel,
  waitForCondition,
} from '@heynixie/testing';
import { z } from 'zod';
import type { NixieOperationArgs } from '../part/build-nixie-operation-schemas';
import { getSandboxRootDir } from '../part/get-sandbox-root-dir';
import { buildAdvanceHelpers } from './build-advance-helpers';
import { readDataFiles } from './read-data-files';
import { readTestBundle } from './read-test-bundle';
import { readTestRecords } from './read-test-records';
import { runHostCommand } from './run-host-command';
import type { AdvanceSteps, MatchRecord, SweptState, TestRecord } from './types';
import { waitForMatch } from './wait-for-match';
import type { BootFileExtras, BootFiles } from './write-boot-files';
import { writeBootFiles } from './write-boot-files';

export type { SweptState } from './types';

type LogLine = Readonly<Record<string, unknown>>;

interface SpawnedNixieExit {
  readonly exit: NixieExit;
  readonly records: readonly LogRecord[];
}

type SpawnedOperationArgs = NixieOperationArgs & { readonly arm: FaultPointArm };

interface SpawnedNixieProcess extends Omit<NixieProcess, 'request'> {
  readonly request: <Name extends keyof SpawnedOperationArgs>(
    operation: Name,
    args: SpawnedOperationArgs[Name],
  ) => Promise<unknown>;

  readonly readOutput: () => string;

  readonly waitForLogEvent: (event: string) => Promise<LogLine>;

  readonly sendStopSignal: () => Promise<void>;

  readonly waitForExit: () => Promise<SpawnedNixieExit>;
}

interface SpawnedNixieHarness {
  readonly now: () => number;

  readonly start: (faultPoints?: readonly FaultPointArm[]) => SpawnedNixieProcess;

  // Starts another release entry on the same config, data directory and doubles, and never waits
  // for ready, which a release does not reach without an impd. Given image keys, it keeps only
  // those in the release's manifest, as a rollback to that release's own manifest does.
  readonly startRelease: (entry: string, imageKeys?: readonly string[]) => SpawnedNixieProcess;

  readonly advance: (durationMs: number, options?: AdvanceOptions) => Promise<void>;
}

export interface SpawnedNixie extends BootFiles {
  readonly directory: string;
  readonly harness: SpawnedNixieHarness;
  readonly model: ScriptedModel;

  readonly checkerModel: ScriptedModel;
  readonly workerModel: ScriptedModel;
  readonly provider: ProviderDouble;
  readonly readRecords: () => Promise<readonly TestRecord[]>;

  readonly waitForRecord: (matches: MatchRecord) => Promise<TestRecord>;

  readonly advanceUntilRecord: (
    stepMs: number,
    maxSteps: number,
    matches: MatchRecord,
  ) => Promise<TestRecord>;

  readonly advanceUntilArrival: (
    nixie: Pick<NixieProcess, 'waitForArrival'>,
    point: string,
    options: AdvanceSteps,
  ) => Promise<FaultPointArrival>;

  readonly readTasks: () => Promise<readonly TestTask[]>;

  readonly readLeases: () => Promise<readonly TestLease[]>;

  readonly readTimers: () => Promise<readonly TestTimer[]>;

  readonly readActions: () => Promise<readonly TestAction[]>;

  readonly readMemoryItems: () => Promise<readonly TestMemoryItem[]>;

  readonly readBackupSets: () => Promise<readonly TestBackupSet[]>;

  readonly readWriterEpoch: () => Promise<number | null>;

  // Marks a destination as a known contact, which lets a send to it pass the destination limits.
  readonly markKnownContact: (destination: string) => Promise<void>;

  readonly waitForQueueCheck: () => Promise<void>;

  readonly waitForModelCalls: (count: number) => Promise<void>;

  readonly readSweptStates: () => readonly SweptState[];

  readonly readDataFiles: () => Promise<
    readonly { readonly name: string; readonly text: string }[]
  >;

  readonly readSandboxIDs: () => Promise<readonly string[]>;
}

interface ModelRoute {
  readonly baseURL: string;
  readonly config: readonly string[];
}

export interface SpawnedNixieOptions {
  readonly isCheckerScripted?: boolean;

  // sets the worker role, on its own scripted model
  readonly isWorkerScripted?: boolean;

  readonly extraConfig?: readonly string[];

  // the address of a fake Google, which a test build reaches Google's endpoints at
  readonly googleURL?: string;

  // the URL of a plain-http site on a loopback address, which the fetch sandbox's stand-in reads the
  // body and the package of a device page's declared fetch and approved package from, in place of
  // the web
  readonly fetchSiteURL?: string;

  // the URL of a double of atc-gateway that the coding runner calls in place of the configured one
  readonly atcURL?: string;

  // settings of the config's `memory` section beside the checker timeout, by their config names
  readonly memoryConfig?: Readonly<Record<string, number>>;

  // lines for the secrets file, such as a connector credential
  readonly extraSecrets?: readonly string[];

  // Puts a proxy in front of the model double: it takes the double's URL and gives back the base
  // URL the profile names and the config lines the proxy needs.
  readonly routeModel?: (upstreamURL: string) => Promise<ModelRoute>;

  readonly logLevel?: LogLevel;

  // where the model credential lives: the secrets file, or the sandbox backend, which a deployment
  // with a spending gateway uses
  readonly modelCredential?: BootFileExtras['modelCredential'];

  readonly release?: string;

  // The entry file of the test bundle to run, where a suite gets it from a rig program; the test
  // bundle that the unit run builds otherwise
  readonly entry?: string;

  readonly backups?: boolean;

  // turns calls on, with the harness's fake speech layer and this price in dollars per minute
  readonly voicePricePerMinute?: number;

  // task definitions that the boot files hold, so the first seed arms their triggers
  readonly taskDefinitions?: BootFileExtras['taskDefinitions'];
}

// A turn runs the real SDK in a guest process, which takes a few seconds on a slow host, and each
// wait ends inside the e2e lane's 15 s limit per test, so a slow turn fails on the wait it missed.
const recordTimeoutMs = 10_000;
const startMs = 1_000_000;

interface Launch {
  readonly entry: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly files: BootFiles;
}

// Starts the doubles and the crash harness, and defers each stop to the stack, so the caller decides
// when the spawned nixie goes: a test at its end, and the verify harness at its own stop.
export async function createSpawnedNixie(
  stack: AsyncDisposableStack,
  options: SpawnedNixieOptions = {},
): Promise<SpawnedNixie> {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-e2e-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const doubles = startDoubles(stack);

  const route =
    options.routeModel === undefined ? null : await options.routeModel(doubles.model.url);

  const files = await writeBootFiles(
    directory,
    route?.baseURL ?? doubles.model.url,
    buildBootExtras(
      { ...options, extraConfig: [...(options.extraConfig ?? []), ...(route?.config ?? [])] },
      doubles,
    ),
  );

  const reader = startLogReader(files.dataDir, stack);

  // a start from source transpiles the whole server each time, so each start runs the test bundle
  // that the run builds once
  const launch: Launch = {
    entry: await readEntry(options),
    args: buildServeArgs(files),
    env: {
      NIXIE_TEST_PROVIDER_URL: doubles.provider.url,
      NIXIE_TEST_FETCHER: join(import.meta.dir, 'run-stub-fetcher.ts'),
      ...(options.atcURL === undefined ? {} : { NIXIE_TEST_ATC_URL: options.atcURL }),
      ...(options.googleURL === undefined ? {} : { NIXIE_TEST_GOOGLE_URL: options.googleURL }),
      ...(options.fetchSiteURL === undefined
        ? {}
        : { NIXIE_TEST_FETCH_SITE_URL: options.fetchSiteURL }),
    },
    files,
  };

  const crashHarness = startCrashHarness({ ...launch, startMs });

  // AsyncDisposableStack disposes in reverse, so every nixie dies before its directory goes.
  stack.defer(() => crashHarness.stop());

  const sweep = startSweepReads(crashHarness, launch, reader);

  const startProcess = (faultPoints?: readonly FaultPointArm[]): SpawnedNixieProcess =>
    options.release === undefined ? sweep.start(faultPoints) : startRelease(launch, stack);

  const harness: SpawnedNixieHarness = {
    now: crashHarness.now,
    start: (faultPoints) => startProcess(faultPoints),
    startRelease: (entry, imageKeys) => {
      const releaseFiles = imageKeys === undefined ? files : writeReleaseManifest(files, imageKeys);

      return startRelease({ ...launch, entry, args: buildServeArgs(releaseFiles) }, stack);
    },
    advance: crashHarness.advance,
  };

  return {
    ...files,
    directory,
    harness,
    ...doubles,
    ...reader,
    readSweptStates: sweep.readSweptStates,
    waitForRecord: (matches) => waitForMatch(reader.readRecords, matches, recordTimeoutMs),
    markKnownContact: async (destination) => {
      await runHostCommand(files.configPath, ['contacts', 'mark-known', destination]);
    },
    waitForQueueCheck: () => waitForQueueCheck(reader.readRecords),
    waitForModelCalls: (count) => waitForModelCalls(doubles.model, count),
    ...buildAdvanceHelpers(harness, reader.readRecords),
    readDataFiles: () => readDataFiles(files.dataDir),
    readSandboxIDs: () => readdir(getSandboxRootDir(files.dataDir)),
  };
}

type TestDoubles = Pick<SpawnedNixie, 'model' | 'provider' | 'checkerModel' | 'workerModel'>;

function startDoubles(stack: AsyncDisposableStack): TestDoubles {
  const model = startScriptedModel();

  stack.defer(() => model.stop());

  const checkerModel = startScriptedModel();

  stack.defer(() => checkerModel.stop());

  const workerModel = startScriptedModel();

  stack.defer(() => workerModel.stop());

  const provider = startProviderDouble();

  stack.defer(() => provider.stop());

  return { model, checkerModel, workerModel, provider };
}

const checkerTimeoutMs = 60 * 60 * 1000;

// A test that scripts the checker's answers gives it its own model.
function buildBootExtras(options: SpawnedNixieOptions, doubles: TestDoubles) {
  return {
    config: [
      // The checker's timeout runs on the harness clock, which a suite advances in steps while the
      // check starts the real SDK on the wall clock. On a busy host 2 steps outran the default
      // timeout mid-check, and the write became a proposal instead of the active item.
      'memory:',
      `  checker_timeout_ms: ${String(checkerTimeoutMs)}`,
      ...Object.entries(options.memoryConfig ?? {}).map(
        ([name, value]) => `  ${name}: ${String(value)}`,
      ),
      ...(options.voicePricePerMinute === undefined
        ? []
        : ['voice:', '  provider: gpt-live', '  credential: deployment:speech']),
      ...(options.extraConfig ?? []),
    ],
    secrets: [
      ...(options.voicePricePerMinute === undefined
        ? []
        : ['connector_credentials:', '  speech: speech-key-a']),
      ...(options.extraSecrets ?? []),
    ],
    ...(options.voicePricePerMinute === undefined
      ? {}
      : { voiceYaml: `price_per_minute: ${String(options.voicePricePerMinute)}\n` }),
    definitions: [],
    hasStarterRules: true,
    ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
    ...(options.modelCredential === undefined ? {} : { modelCredential: options.modelCredential }),
    ...buildRoleModelExtras(options, doubles),
    ...(options.release === undefined ? {} : { sandboxAdapter: 'imp' as const }),
    ...(options.backups === undefined ? {} : { isBackupOn: options.backups }),
    ...(options.taskDefinitions === undefined ? {} : { taskDefinitions: options.taskDefinitions }),
  };
}

function buildRoleModelExtras(options: SpawnedNixieOptions, doubles: TestDoubles) {
  const urls = {
    ...(options.isCheckerScripted === true ? { checker: doubles.checkerModel.url } : {}),
    ...(options.isWorkerScripted === true ? { worker: doubles.workerModel.url } : {}),
  };

  return Object.keys(urls).length === 0 ? {} : { roleModelURLs: urls };
}

type LogReader = Pick<
  SpawnedNixie,
  | 'readRecords'
  | 'readTasks'
  | 'readLeases'
  | 'readTimers'
  | 'readActions'
  | 'readMemoryItems'
  | 'readBackupSets'
  | 'readWriterEpoch'
>;

type Database = ReturnType<typeof startDatabase>;

function startLogReader(dataDir: string, stack: AsyncDisposableStack): LogReader {
  const reader: { db: Database | null; inode: number | null } = { db: null, inode: null };

  // A restore replaces the database file, and a handle on the old file reads the old log.
  const readReader = (): Database => {
    const path = getDataFilePath(dataDir, 'nixie.db');
    const inode = statSync(path, { throwIfNoEntry: false })?.ino ?? null;

    if (reader.db !== null && inode !== null && inode !== reader.inode) {
      void reader.db.destroy();
      reader.db = null;
    }

    reader.db ??= startDatabase(path);
    reader.inode = inode;

    return reader.db;
  };

  stack.defer(() => reader.db?.destroy());

  const readWriter = (): Pick<Writer, 'db'> => ({ db: readReader() });

  return {
    readRecords: async () => {
      const rows = await readTestRecordRows(readWriter());

      return rows.map((row) => ({
        sequence: row.sequence,
        kind: row.kind,
        thread: row.thread,
        stepKey: row.step_key,
        payload: parseJSONObject(row.payload),
      }));
    },
    readTasks: () => readTestTasks(readWriter()),
    readLeases: () => readTestLeases(readWriter()),
    readTimers: () => readTestTimers(readWriter()),
    readActions: () => readTestActions(readWriter()),
    readMemoryItems: () => readTestMemoryItems(readWriter()),
    readBackupSets: () => readTestBackupSets(readWriter()),
    readWriterEpoch: () => readTestWriterEpoch(readWriter()),
  };
}

async function readEntry(options: SpawnedNixieOptions): Promise<string> {
  const given = options.release ?? options.entry;

  if (given !== undefined) {
    return given;
  }

  const bundle = await readTestBundle(true);

  return bundle.entry;
}

function buildServeArgs(files: BootFiles): readonly string[] {
  return [
    'serve',
    '--config',
    files.configPath,
    '--manifest',
    files.manifestPath,
    '--sops',
    files.sopsPath,

    '--encoder',
    '',
  ];
}

type SweepReader = Pick<SpawnedNixie, 'readLeases' | 'readTasks'>;

function startSweepReads(
  crashHarness: CrashHarness,
  launch: Launch,
  reader: SweepReader,
): Pick<SpawnedNixieHarness, 'start'> & Pick<SpawnedNixie, 'readSweptStates'> {
  const states: SweptState[] = [];

  return {
    start: (faultPoints = []) => {
      const nixie = crashHarness.start([...faultPoints, { point: 'test.swept' }]);

      void readSweptState(nixie, reader, (state) => {
        states.push(state);
      });

      return trackSpawnedNixieProcess(nixie, launch.files);
    },
    readSweptStates: () => states,
  };
}

async function readSweptState(
  nixie: NixieProcess,
  reader: SweepReader,
  onState: (state: SweptState) => void,
): Promise<void> {
  const arrival = await nixie.waitForArrival('test.swept').catch(() => null);

  if (arrival === null) {
    return;
  }

  onState({ leases: await reader.readLeases(), tasks: await reader.readTasks() });

  nixie.release(arrival);
}

function trackSpawnedNixieProcess(nixie: NixieProcess, files: BootFiles): SpawnedNixieProcess {
  const state = { hasExited: false };

  void (async () => {
    await nixie.exited;

    state.hasExited = true;
  })();

  const readOutput = () => `${nixie.readStdout()}${nixie.readStderr()}`;

  const waitForLogEvent = async (event: string): Promise<LogLine> => {
    const readEventLine = () =>
      parseLogLines(nixie.readStdout()).find((line) => line['event'] === event);

    await waitForCondition(() => readEventLine() !== undefined || state.hasExited, {
      timeoutMs: recordTimeoutMs,
    });

    const line = readEventLine();

    if (line === undefined) {
      throw new Error(`nixie exited without the log event ${event}:\n${readOutput()}`);
    }

    return line;
  };

  return {
    ...nixie,
    request: (operation, args) => nixie.request(operation, args),
    readOutput,
    waitForLogEvent,
    sendStopSignal: async () => {
      nixie.signal('SIGTERM');

      await waitForLogEvent('stopping');
    },
    waitForExit: async () => {
      const exit = await nixie.exited;
      const records = await readTestRecords(files.dataDir, files.deploymentKey);

      return { exit, records };
    },
  };
}

const logLineSchema = z.record(z.string(), z.unknown()).readonly();

function parseLogLines(text: string): readonly LogLine[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => logLineSchema.parse(JSON.parse(line)));
}

// A release bundle leaves the harness link out, so it never sends ready over IPC, and its ready
// log line stands in.
function startRelease(launch: Launch, stack: AsyncDisposableStack): SpawnedNixieProcess {
  const nixie = startNixieProcess({ ...launch, clockMs: startMs });

  stack.defer(async () => {
    await nixie.kill();
  });

  const started = trackSpawnedNixieProcess(nixie, launch.files);

  const ready = (async () => {
    await started.waitForLogEvent('ready');
  })();

  // A test that never waits for ready, such as one that stops a release before it gets there,
  // leaves the rejection unobserved.
  void Promise.allSettled([ready]);

  return { ...started, ready };
}

// Sync, so that startRelease hands back its process at once, as the build's own start does
function writeReleaseManifest(files: BootFiles, imageKeys: readonly string[]): BootFiles {
  const manifest = z
    .record(z.string(), z.string())
    .parse(JSON.parse(readFileSync(files.manifestPath, 'utf8')));

  // A key the build under check no longer has, such as an image kind a later release replaced,
  // still gets an image, as the manifest of the release itself would hold one.
  const kept = imageKeys.map((key) => [
    key,
    manifest[key] ?? `ghcr.io/example/nixie-${key}@sha256:${'0'.repeat(64)}`,
  ]);

  const manifestPath = join(dirname(files.manifestPath), 'release-sandbox-manifest.json');

  writeFileSync(manifestPath, JSON.stringify(Object.fromEntries(kept)));

  return { ...files, manifestPath };
}

// Each start of nixie checks its action queue with an action of its own, which reaches every
// action fault point, so a test arms those points once this check is done.
async function waitForQueueCheck(readRecords: SpawnedNixie['readRecords']): Promise<void> {
  await waitForCondition(
    async () => {
      const records = await readRecords();

      const started = records.findLast((record) => record.kind === 'server.started');

      return (
        started !== undefined &&
        records.some(
          (record) =>
            record.sequence > started.sequence &&
            record.kind === 'action.outcome' &&
            record.thread === 'queue-check',
        )
      );
    },
    { timeoutMs: recordTimeoutMs },
  );
}

async function waitForModelCalls(model: ScriptedModel, count: number): Promise<void> {
  await waitForCondition(
    () => model.requests.filter((request) => request.path === '/v1/messages').length >= count,
    { timeoutMs: recordTimeoutMs },
  );
}
