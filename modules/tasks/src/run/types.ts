import type { TaskReport, TasksContext } from '../types';
import type { taskRunEndedCodec } from './task-run-ended-codec';
import type { taskRunOpenedCodec } from './task-run-opened-codec';

export type TaskRunOpened = ReturnType<typeof taskRunOpenedCodec.decode>;

export type TaskRunEnded = ReturnType<typeof taskRunEndedCodec.decode>;

export type RunLimits = TaskRunOpened['limits'];

export type RunMeterName = 'turns' | 'dollars';

// One row of the task_runs projection, folded from the 3 task run records and no other.
export interface TaskRun {
  readonly runID: string;
  readonly taskID: string;
  readonly openedSequence: number;
  readonly startedAt: Date;
  readonly opened: TaskRunOpened;

  // set by task.run_report_requested
  readonly reportID: string | null;
  readonly ended: {
    readonly record: TaskRunEnded;
    readonly sequence: number;
    readonly endedAt: Date;
  } | null;
}

export type RunState =
  | { readonly kind: 'none' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'open'; readonly run: TaskRun; readonly phase: RunPhase };

// waiting_reply when the task has an open wait, idle when it waits with none (its last turn was
// quiet), and active otherwise
export type RunPhase = 'active' | 'waiting_reply' | 'idle';

export interface RunMeter {
  readonly name: RunMeterName;
  readonly read: (context: Pick<TasksContext, 'log'>, run: TaskRun) => Promise<number>;

  // the limit as a person reads it, such as "$10.00" or "40 turns"
  readonly render: (limit: number) => string;
}

// The server builds it once and passes it to the claim, the start and the end of a task run.
export interface RunSettings {
  readonly reportDefaults: { readonly start: TaskReport; readonly definition: TaskReport };
  readonly meters: readonly [RunMeter, RunMeter];

  // the count of task messages in one exchange past which a message no longer wakes its receiver
  readonly hopLimit: number;
}

export type RunDelivery = TaskRunEnded['delivery'];
