import { onTestFinished } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import type { LogRecord } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import type { LogLevel } from '@heynixie/logger';
import type { BootFiles } from '@heynixie/server/test-utils';
import { readDataFiles, readTestRecords, writeBootFiles } from '@heynixie/server/test-utils';
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
import { buildAdvanceHelpers } from './build-advance-helpers';
import type { AdvanceSteps, MatchRecord, RecoveredState, TestRecord, TestRow } from './types';
import { waitForMatch } from './wait-for-match';

export type { RecoveredState } from './types';

type LogLine = Readonly<Record<string, unknown>>;

interface SpawnedNixieExit {
  readonly exit: NixieExit;
  readonly records: readonly LogRecord[];
}

interface SpawnedNixieProcess extends NixieProcess {
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
    nixie: NixieProcess,
    point: string,
    options: AdvanceSteps,
  ) => Promise<FaultPointArrival>;

  readonly readRows: (table: string) => Promise<readonly TestRow[]>;

  readonly waitForQueueCheck: () => Promise<void>;

  readonly readRecoveredStates: () => readonly RecoveredState[];

  readonly readDataFiles: () => Promise<
    readonly { readonly name: string; readonly text: string }[]
  >;

  readonly readSandboxIDs: () => Promise<readonly string[]>;
}

export interface SpawnedNixieOptions {
  readonly memoryWriter?: boolean;

  readonly extraConfig?: readonly string[];

  readonly extraSecrets?: readonly string[];

  readonly extraDefinitions?: readonly string[];

  readonly logLevel?: LogLevel;

  readonly release?: string;
}

// A turn runs the real SDK in a guest process, which takes a few seconds on a slow host.
const recordTimeoutMs = 30_000;
const startMs = 1_000_000;
const serverEntry = join(import.meta.dir, '../../apps/server/src/main.ts');

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

  const launch: Launch = {
    entry: options.release ?? serverEntry,
    args: buildServeArgs(files),
    env: { NIXIE_TEST_PROVIDER_URL: doubles.provider.url },
    files,
  };

  const crashHarness = startCrashHarness({ ...launch, startMs });

  // AsyncDisposableStack disposes in reverse, so every nixie dies before its directory goes.
  stack.defer(() => crashHarness.stop());

  const recovery = startRecoveryReads(crashHarness, launch, reader.readRows);

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
    ...buildAdvanceHelpers(harness, reader.readRecords),
    readDataFiles: () => readDataFiles(files.dataDir),
    readSandboxIDs: () => readdir(join(files.dataDir, 'sandboxes')),
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
      ...(options.extraConfig ?? []),
    ],
    secrets: options.extraSecrets ?? [],
    definitions: options.extraDefinitions ?? [],
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
  };
}

type LogReader = Pick<SpawnedNixie, 'readRecords' | 'readRows'>;

type Database = ReturnType<typeof startDatabase>;

interface RecordRow {
  readonly sequence: number;
  readonly kind: string;
  readonly thread: string | null;
  readonly step_key: string | null;
  readonly payload: string;
}

// Kysely's table map needs an index signature, which an interface lacks, so these are type aliases.
type ReaderTables = Readonly<{ records: RecordRow }>;

type AnyTables = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

function startLogReader(dataDir: string, stack: AsyncDisposableStack): LogReader {
  const reader: { db: Database | null } = { db: null };

  const getReader = (): Database => {
    reader.db ??= startDatabase(join(dataDir, 'nixie.db'));

    return reader.db;
  };

  stack.defer(() => reader.db?.destroy());

  return {
    readRecords: async () => {
      const rows = await getReader()
        .$extendTables<ReaderTables>()
        .selectFrom('records')
        .select(['sequence', 'kind', 'thread', 'step_key', 'payload'])
        .orderBy('sequence')
        .execute();

      return rows.map((row) => ({
        sequence: row.sequence,
        kind: row.kind,
        thread: row.thread,
        stepKey: row.step_key,
        payload: parseJSONObject(row.payload),
      }));
    },
    readRows: (table) =>
      getReader().$extendTables<AnyTables>().selectFrom(table).selectAll().execute(),
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

function startRecoveryReads(
  crashHarness: CrashHarness,
  launch: Launch,
  readRows: SpawnedNixie['readRows'],
): Pick<SpawnedNixieHarness, 'start'> & Pick<SpawnedNixie, 'readRecoveredStates'> {
  const states: RecoveredState[] = [];

  return {
    start: (faultPoints = []) => {
      const nixie = crashHarness.start([...faultPoints, { point: 'test.recovered' }]);

      void readRecoveredState(nixie, readRows, (state) => {
        states.push(state);
      });

      return trackSpawnedNixieProcess(nixie, launch.files);
    },
    readRecoveredStates: () => states,
  };
}

async function readRecoveredState(
  nixie: NixieProcess,
  readRows: SpawnedNixie['readRows'],
  onState: (state: RecoveredState) => void,
): Promise<void> {
  const arrival = await nixie.waitForArrival('test.recovered').catch(() => null);

  if (arrival === null) {
    return;
  }

  onState({ leases: await readRows('leases'), tasks: await readRows('tasks') });

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
