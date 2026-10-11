// One record of the log as the test reads it from the database: its envelope and its plain
// payload, never its erasable fields.
export interface TestRecord {
  readonly sequence: number;
  readonly kind: string;
  readonly thread: string | null;
  readonly stepKey: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type MatchRecord = (record: TestRecord) => boolean;

export interface AdvanceSteps {
  readonly stepMs: number;
  readonly maxSteps: number;
}

export type TestRow = Readonly<Record<string, unknown>>;

export interface RecoveredState {
  readonly leases: readonly TestRow[];
  readonly tasks: readonly TestRow[];
}
