import { match } from 'ts-pattern';
import type { ControlledFields, TaskControlPlan } from './types';

// A field the control leaves alone is absent, so a caller keeps its current value.
export function buildControlledFields(plan: TaskControlPlan): ControlledFields {
  return match(plan)
    .returnType<ControlledFields>()
    .with({ kind: 'task.pause_requested' }, () => ({ isPauseRequested: true }))
    .with({ kind: 'task.paused' }, (paused) => ({
      state: 'paused',
      isPauseRequested: false,
      resumeState: paused.resumeState,
    }))
    .with({ kind: 'task.resumed' }, (resumed) => ({
      state: resumed.nextState,
      isPauseRequested: false,
      resumeState: null,
    }))
    .with({ kind: 'task.stopped' }, (stopped) => ({
      state: 'stopped',
      isPauseRequested: false,
      resumeState: stopped.resumeState,
    }))
    .with({ kind: 'task.restarted' }, (restarted) => ({
      state: restarted.nextState,
      resumeState: null,
    }))
    .with({ kind: 'task.closed' }, () => ({
      state: 'closed',
      isPauseRequested: false,
      resumeState: null,
    }))
    .with({ kind: 'task.interrupted' }, () => ({}))
    .exhaustive();
}
