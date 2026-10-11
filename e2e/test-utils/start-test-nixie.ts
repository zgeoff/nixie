import { onTestFinished } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '../../libs/db/src/index';
import type {
  CrashHarness,
  FaultPointArrival,
  NixieProcess,
  ProviderDouble,
  ScriptedModel,
} from '../../libs/testing/src/index';
import {
  startCrashHarness,
  startProviderDouble,
  startScriptedModel,
} from '../../libs/testing/src/index';
import { buildAdvanceHelpers } from './build-advance-helpers';
import type { AdvanceSteps, MatchRecord, RecoveredState, TestRecord, TestRow } from './types';
import { waitForMatch } from './wait-for-match';

export type { RecoveredState } from './types';

export interface TestNixie {
  readonly dataDir: string;

  // the raw deployment key nixie starts with, which the oracle needs to read the log
  readonly deploymentKey: string;
  readonly harness: CrashHarness;
  readonly model: ScriptedModel;
  readonly provider: ProviderDouble;
  readonly readRecords: () => Promise<readonly TestRecord[]>;

  // the first record that matches, once one is in the log
  readonly waitForRecord: (matches: MatchRecord) => Promise<TestRecord>;

  // advances the clock by stepMs until a record matches, at most maxSteps times, for a wait inside
  // nixie, such as a turn's wait for an action, that may start its sleep after the first advance
  readonly advanceUntilRecord: (
    stepMs: number,
    maxSteps: number,
    matches: MatchRecord,
  ) => Promise<TestRecord>;

  // advances the clock by stepMs until nixie arrives at the fault point, at most maxSteps times
  readonly advanceUntilArrival: (
    nixie: NixieProcess,
    point: string,
    options: AdvanceSteps,
  ) => Promise<FaultPointArrival>;

  // every row of a table, read beside the nixie that writes it
  readonly readRows: (table: string) => Promise<readonly TestRow[]>;

  // the leases and the tasks as each start's recovery left them, in the order the starts recovered
  readonly readRecoveredStates: () => readonly RecoveredState[];
}

// Sets up a crash test: a fresh data directory, the scripted model and the provider double in the
// test process, where their records survive every kill, and the crash harness at 1,000,000 ms.
export async function startTestNixie(): Promise<TestNixie> {
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

function startNixieHarness(
  stack: AsyncDisposableStack,
  env: Readonly<Record<string, string>>,
): CrashHarness {
  const harness = startCrashHarness({
    entry: join(import.meta.dir, '../nixie/main.ts'),
    startMs: 1_000_000,
    env,
  });

  // the disposals run in reverse, so every nixie dies before its data directory goes
  stack.defer(() => harness.stop());
  return harness;
}

// Wraps the harness so each start holds at the end of its recovery while the test reads the leases
// and the tasks it left, then lets its runners start.
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

// A start that exits before its recovery ends, such as one that finds the writer lock held, leaves
// no state.
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

// a turn runs the real SDK in a guest process, which takes a few seconds on a slow host
const recordTimeoutMs = 30_000;

function startDoubles(stack: AsyncDisposableStack): Pick<TestNixie, 'model' | 'provider'> {
  const model = startScriptedModel();

  stack.defer(() => model.stop());

  const provider = startProviderDouble();

  stack.defer(() => provider.stop());
  return { model, provider };
}

// A read connection beside nixie, opened on the first read once nixie has made the database.
function startLogReader(
  dataDir: string,
  stack: AsyncDisposableStack,
): Pick<TestNixie, 'readRecords' | 'readRows'> {
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

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the log stores JSON
        payload: JSON.parse(row.payload) as Readonly<Record<string, unknown>>,
      }));
    },
    readRows: (table) =>
      getReader().$extendTables<AnyTables>().selectFrom(table).selectAll().execute(),
  };
}

type Database = ReturnType<typeof startDatabase>;

// mapped types, because Kysely's table map needs the index signature an interface lacks
type ReaderTables = Readonly<{ records: RecordRow }>;
type AnyTables = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

interface RecordRow {
  readonly sequence: number;
  readonly kind: string;
  readonly thread: string | null;
  readonly step_key: string | null;
  readonly payload: string;
}
