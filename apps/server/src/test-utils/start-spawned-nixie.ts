import { onTestFinished } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import type { NixieOperationArgs } from '../build-nixie-operation-schemas';
import { getSandboxRootDir } from '../get-sandbox-root-dir';
import { buildAdvanceHelpers } from './build-advance-helpers';
import { readDataFiles } from './read-data-files';
import { readTestBundle } from './read-test-bundle';
import { readTestRecords } from './read-test-records';
import type { AdvanceSteps, MatchRecord, RecoveredState, TestRecord } from './types';
import { waitForMatch } from './wait-for-match';
import type { BootFiles } from './write-boot-files';
import { writeBootFiles } from './write-boot-files';

export type { RecoveredState } from './types';

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

  readonly advance: (durationMs: number, options?: AdvanceOptions) => Promise<void>;
}

export interface SpawnedNixie extends BootFiles {
  readonly directory: string;
  readonly harness: SpawnedNixieHarness;
  readonly model: ScriptedModel;

  readonly writerModel: ScriptedModel;

  readonly checkerModel: ScriptedModel;
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

  readonly waitForQueueCheck: () => Promise<void>;

  readonly waitForModelCalls: (count: number) => Promise<void>;

  readonly readRecoveredStates: () => readonly RecoveredState[];

  readonly readDataFiles: () => Promise<
    readonly { readonly name: string; readonly text: string }[]
  >;

  readonly readSandboxIDs: () => Promise<readonly string[]>;
}

export interface SpawnedNixieOptions {
  readonly memoryWriter?: boolean;

  readonly extraConfig?: readonly string[];

  readonly logLevel?: LogLevel;

  readonly release?: string;

  readonly backups?: boolean;
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

export async function startSpawnedNixie(options: SpawnedNixieOptions = {}): Promise<SpawnedNixie> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-e2e-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const doubles = startDoubles(stack);

  const files = await writeBootFiles(
    directory,
    doubles.model.url,
    buildBootExtras(options, doubles),
  );

  const reader = startLogReader(files.dataDir, stack);

  // a start from source transpiles the whole server each time, so each start runs the test bundle
  // that the run builds once
  const testBundle = await readTestBundle(true);

  const launch: Launch = {
    entry: options.release ?? testBundle.entry,
    args: buildServeArgs(files),
    env: { NIXIE_TEST_PROVIDER_URL: doubles.provider.url },
    files,
  };

  const crashHarness = startCrashHarness({ ...launch, startMs });

  // AsyncDisposableStack disposes in reverse, so every nixie dies before its directory goes.
  stack.defer(() => crashHarness.stop());

  const recovery = startRecoveryReads(crashHarness, launch, reader);

  const harness: SpawnedNixieHarness = {
    now: crashHarness.now,
    start: options.release === undefined ? recovery.start : () => startRelease(launch, stack),
    advance: crashHarness.advance,
  };

  return {
    ...files,
    directory,
    harness,
    ...doubles,
    ...reader,
    readRecoveredStates: recovery.readRecoveredStates,
    waitForRecord: (matches) => waitForMatch(reader.readRecords, matches, recordTimeoutMs),
    waitForQueueCheck: () => waitForQueueCheck(reader.readRecords),
    waitForModelCalls: (count) => waitForModelCalls(doubles.model, count),
    ...buildAdvanceHelpers(harness, reader.readRecords),
    readDataFiles: () => readDataFiles(files.dataDir),
    readSandboxIDs: () => readdir(getSandboxRootDir(files.dataDir)),
  };
}

type TestDoubles = Pick<SpawnedNixie, 'model' | 'provider' | 'writerModel' | 'checkerModel'>;

function startDoubles(stack: AsyncDisposableStack): TestDoubles {
  const model = startScriptedModel();

  stack.defer(() => model.stop());

  const writerModel = startScriptedModel();

  stack.defer(() => writerModel.stop());

  const checkerModel = startScriptedModel();

  stack.defer(() => checkerModel.stop());

  const provider = startProviderDouble();

  stack.defer(() => provider.stop());

  return { model, writerModel, checkerModel, provider };
}

const checkerTimeoutMs = 60 * 60 * 1000;

// The memory writer and the consolidator ask the model on their own schedule, so a test that does
// not ask for them keeps them off and its scripted replies for the turns it drives. The writer's
// gate asks the checker in the middle of a batch, so the checker gets its own model as well.
function buildBootExtras(options: SpawnedNixieOptions, doubles: TestDoubles) {
  const isWriterOn = options.memoryWriter === true;

  return {
    config: [
      'memory_writer:',
      `  enabled: ${String(isWriterOn)}`,
      'memory_consolidation:',
      '  enabled: false',

      // The checker's timeout runs on the harness clock, which a suite advances in steps while the
      // check starts the real SDK on the wall clock. On a busy host 2 steps outran the default
      // timeout mid-check, and the writer staged a proposal instead of the active item.
      'memory:',
      `  checker_timeout_ms: ${String(checkerTimeoutMs)}`,
      ...(options.extraConfig ?? []),
    ],
    secrets: [],
    definitions: [],
    ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
    ...(isWriterOn
      ? {
          roleModelURLs: {
            'memory-writer': doubles.writerModel.url,
            checker: doubles.checkerModel.url,
          },
        }
      : {}),
    ...(options.release === undefined ? {} : { sandboxAdapter: 'imp' as const }),
    ...(options.backups === undefined ? {} : { isBackupOn: options.backups }),
  };
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
  const reader: { db: Database | null } = { db: null };

  const getReader = (): Database => {
    reader.db ??= startDatabase(getDataFilePath(dataDir, 'nixie.db'));

    return reader.db;
  };

  stack.defer(() => reader.db?.destroy());

  const getWriter = (): Pick<Writer, 'db'> => ({ db: getReader() });

  return {
    readRecords: async () => {
      const rows = await readTestRecordRows(getWriter());

      return rows.map((row) => ({
        sequence: row.sequence,
        kind: row.kind,
        thread: row.thread,
        stepKey: row.step_key,
        payload: parseJSONObject(row.payload),
      }));
    },
    readTasks: () => readTestTasks(getWriter()),
    readLeases: () => readTestLeases(getWriter()),
    readTimers: () => readTestTimers(getWriter()),
    readActions: () => readTestActions(getWriter()),
    readMemoryItems: () => readTestMemoryItems(getWriter()),
    readBackupSets: () => readTestBackupSets(getWriter()),
    readWriterEpoch: () => readTestWriterEpoch(getWriter()),
  };
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

type RecoveryReader = Pick<SpawnedNixie, 'readLeases' | 'readTasks'>;

function startRecoveryReads(
  crashHarness: CrashHarness,
  launch: Launch,
  reader: RecoveryReader,
): Pick<SpawnedNixieHarness, 'start'> & Pick<SpawnedNixie, 'readRecoveredStates'> {
  const states: RecoveredState[] = [];

  return {
    start: (faultPoints = []) => {
      const nixie = crashHarness.start([...faultPoints, { point: 'test.recovered' }]);

      void readRecoveredState(nixie, reader, (state) => {
        states.push(state);
      });

      return trackSpawnedNixieProcess(nixie, launch.files);
    },
    readRecoveredStates: () => states,
  };
}

async function readRecoveredState(
  nixie: NixieProcess,
  reader: RecoveryReader,
  onState: (state: RecoveredState) => void,
): Promise<void> {
  const arrival = await nixie.waitForArrival('test.recovered').catch(() => null);

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
