import type { TestLease, TestTask } from '@heynixie/tasks/test-utils';

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

export interface RecoveredState {
  readonly leases: readonly TestLease[];
  readonly tasks: readonly TestTask[];
}
