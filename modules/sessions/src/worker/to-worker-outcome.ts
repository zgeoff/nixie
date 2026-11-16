import { match } from 'ts-pattern';

export type WorkerOutcome =
  | 'answered'
  | 'limit'
  | 'sandbox_failed'
  | 'model_failed'
  | 'interrupted'
  | 'no_answer'
  | 'aborted'
  | 'unknown';

// A release that adds an outcome stores a string this one does not know, which reads as unknown.
export function toWorkerOutcome(stored: string): WorkerOutcome {
  return match(stored)
    .returnType<WorkerOutcome>()
    .with(
      'answered',
      'limit',
      'sandbox_failed',
      'model_failed',
      'interrupted',
      'no_answer',
      'aborted',
      (outcome) => outcome,
    )
    .otherwise(() => 'unknown');
}
