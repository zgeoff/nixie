import { onTestFinished } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { parseJSONObject } from '@heynixie/log';
import type {
  CrashHarness,
  FaultPointArrival,
  NixieProcess,
  ProviderDouble,
  ScriptedModel,
} from '@heynixie/testing';
import { startCrashHarness, startProviderDouble, startScriptedModel } from '@heynixie/testing';
import { buildAdvanceHelpers } from './build-advance-helpers';
import type { AdvanceSteps, MatchRecord, RecoveredState, TestRecord, TestRow } from './types';
import { waitForMatch } from './wait-for-match';

export type { RecoveredState } from './types';

export interface TestNixie {
  readonly dataDir: string;

  readonly deploymentKey: string;
  readonly harness: CrashHarness;
  readonly model: ScriptedModel;

  readonly writerModel: ScriptedModel;
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

  readonly readRecoveredStates: () => readonly RecoveredState[];
}

export interface TestNixieOptions {
  readonly memoryWriter?: boolean;
}

// A turn runs the real SDK in a guest process, which takes a few seconds on a slow host.
const recordTimeoutMs = 30_000;

export async function startTestNixie(options: TestNixieOptions = {}): Promise<TestNixie> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-crash-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const doubles = startDoubles(stack);
  const deploymentKey = randomBytes(32).toString('base64');

  const crashHarness = startNixieHarness(stack, {
    NIXIE_DATA_DIR: dataDir,
    NIXIE_TEST_DEPLOYMENT_KEY: deploymentKey,
    NIXIE_TEST_MODEL_URL: doubles.model.url,
    NIXIE_TEST_PROVIDER_URL: doubles.provider.url,
    ...(options.memoryWriter === true
      ? { NIXIE_TEST_WRITER_MODEL_URL: doubles.writerModel.url }
      : {}),
  });

  const reader = startLogReader(dataDir, stack);
  const recovery = startRecoveryReads(crashHarness, reader.readRows);

  return {
    dataDir,
    deploymentKey,
    ...recovery,
    ...doubles,
    ...reader,
    waitForRecord: (matches) => waitForMatch(reader.readRecords, matches, recordTimeoutMs),
    ...buildAdvanceHelpers(recovery.harness, reader.readRecords),
  };
}

type TestDoubles = Pick<TestNixie, 'model' | 'provider' | 'writerModel'>;

function startDoubles(stack: AsyncDisposableStack): TestDoubles {
  const model = startScriptedModel();

  stack.defer(() => model.stop());

  const writerModel = startScriptedModel();

  stack.defer(() => writerModel.stop());

  const provider = startProviderDouble();

  stack.defer(() => provider.stop());

  return { model, writerModel, provider };
}

type NixieEnv = Readonly<Record<string, string>>;

function startNixieHarness(stack: AsyncDisposableStack, env: NixieEnv): CrashHarness {
  const harness = startCrashHarness({
    entry: join(import.meta.dir, '../nixie/main.ts'),
    startMs: 1_000_000,
    env,
  });

  // AsyncDisposableStack disposes in reverse, so every nixie dies before its data directory goes.
  stack.defer(() => harness.stop());

  return harness;
}

type LogReader = Pick<TestNixie, 'readRecords' | 'readRows'>;

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

function startRecoveryReads(
  crashHarness: CrashHarness,
  readRows: TestNixie['readRows'],
): Pick<TestNixie, 'harness' | 'readRecoveredStates'> {
  const states: RecoveredState[] = [];

  return {
    harness: {
      ...crashHarness,
      start: (faultPoints = []) => {
        const nixie = crashHarness.start([...faultPoints, { point: 'test.recovered' }]);

        void readRecoveredState(nixie, readRows, (state) => {
          states.push(state);
        });

        return nixie;
      },
    },
    readRecoveredStates: () => states,
  };
}

async function readRecoveredState(
  nixie: NixieProcess,
  readRows: TestNixie['readRows'],
  onState: (state: RecoveredState) => void,
): Promise<void> {
  const arrival = await nixie.waitForArrival('test.recovered').catch(() => null);

  if (arrival === null) {
    return;
  }

  onState({ leases: await readRows('leases'), tasks: await readRows('tasks') });

  nixie.release(arrival);
}
