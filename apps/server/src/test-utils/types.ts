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

export interface SweptState {
  readonly leases: readonly TestLease[];
  readonly tasks: readonly TestTask[];
}

export interface RepoPackage {
  // the folder from the repo root, such as modules/api
  readonly directory: string;
  readonly name: string;
  readonly tags: readonly string[];

  // the workspace packages it declares, as dependencies or dev dependencies
  readonly dependsOn: readonly string[];
}

export interface NameLeak {
  readonly file: string;
  readonly name: string;
}

export interface ImportLeak {
  readonly directory: string;
  readonly importName: string;
}
