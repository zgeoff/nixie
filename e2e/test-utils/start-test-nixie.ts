import { onTestFinished } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '../../libs/db/src/index';
import type { CrashHarness, ProviderDouble, ScriptedModel } from '../../libs/testing/src/index';
import {
  startCrashHarness,
  startProviderDouble,
  startScriptedModel,
  waitForCondition,
} from '../../libs/testing/src/index';

// One record of the log as the test reads it from the database: its envelope and its plain
// payload, never its erasable fields.
interface TestRecord {
  readonly sequence: number;
  readonly kind: string;
  readonly thread: string | null;
  readonly stepKey: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

type MatchRecord = (record: TestRecord) => boolean;

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

  // every row of a table, read beside the nixie that writes it
  readonly readRows: (table: string) => Promise<readonly Readonly<Record<string, unknown>>[]>;
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
  const harness = startCrashHarness({
    entry: join(import.meta.dir, '../nixie/main.ts'),
    startMs: 1_000_000,
    env: {
      NIXIE_DATA_DIR: dataDir,
      NIXIE_TEST_DEPLOYMENT_KEY: deploymentKey,
      NIXIE_TEST_MODEL_URL: doubles.model.url,
      NIXIE_TEST_PROVIDER_URL: doubles.provider.url,
    },
  });

  // the disposals run in reverse, so every nixie dies before its data directory goes
  stack.defer(() => harness.stop());

  const reader = startLogReader(dataDir, stack);

  return {
    dataDir,
    deploymentKey,
    harness,
    ...doubles,
    ...reader,
    waitForRecord: (matches) => waitForMatch(reader.readRecords, matches, recordTimeoutMs),
    advanceUntilRecord: (stepMs, maxSteps, matches) =>
      runAdvances({ harness, readRecords: reader.readRecords, stepMs, matches }, maxSteps),
  };
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

async function waitForMatch(
  readRecords: TestNixie['readRecords'],
  matches: MatchRecord,
  timeoutMs: number,
): Promise<TestRecord> {
  const found: { record: TestRecord | null } = { record: null };

  await waitForCondition(
    async () => {
      const records = await readRecords();

      found.record = records.find((record) => matches(record)) ?? null;
      return found.record !== null;
    },
    { timeoutMs },
  );
  if (found.record === null) {
    throw new Error('the wait found no record');
  }
  return found.record;
}

interface Advances {
  readonly harness: CrashHarness;
  readonly readRecords: TestNixie['readRecords'];
  readonly stepMs: number;
  readonly matches: MatchRecord;
}

async function runAdvances(advances: Advances, remaining: number): Promise<TestRecord> {
  await advances.harness.advance(advances.stepMs);

  const found = await waitForMatch(advances.readRecords, advances.matches, 1000).catch(() => null);

  if (found !== null) {
    return found;
  }
  if (remaining <= 1) {
    throw new Error(`no record matched after the last advance of ${advances.stepMs} ms`);
  }
  return runAdvances(advances, remaining - 1);
}
