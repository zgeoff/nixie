import type { RecordInput } from '@heynixie/log';

export interface StepFailure {
  readonly reason: string;

  readonly isWaitingForOwner: boolean;

  readonly records: readonly RecordInput[];
}

export class StepFailedError extends Error {
  readonly reason: string;

  readonly isWaitingForOwner: boolean;

  readonly records: readonly RecordInput[];

  constructor(message: string, failure: StepFailure, options?: Readonly<ErrorOptions>) {
    super(message, options);

    this.name = 'StepFailedError';
    this.reason = failure.reason;
    this.isWaitingForOwner = failure.isWaitingForOwner;
    this.records = failure.records;
  }
}
