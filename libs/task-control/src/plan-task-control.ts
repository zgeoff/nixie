import { match } from 'ts-pattern';
import type {
  ResumeState,
  TaskControl,
  TaskControlFacts,
  TaskControlPlan,
  TaskControlRefusal,
  TaskState,
} from './types';

export function planTaskControl(
  control: TaskControl,
  facts: TaskControlFacts,
): TaskControlPlan | TaskControlRefusal {
  if (control === 'close' && facts.isConversation) {
    return { reason: 'conversation_never_closes' };
  }

  if (!canControl(control, facts)) {
    return { reason: 'not_allowed', state: facts.state, isPauseRequested: facts.isPauseRequested };
  }

  return match(control)
    .returnType<TaskControlPlan>()
    .with('pause', () =>
      facts.state === 'running'
        ? { kind: 'task.pause_requested' }
        : { kind: 'task.paused', resumeState: pickHeldState(facts) },
    )
    .with('resume', () => ({
      kind: 'task.resumed',
      nextState: facts.state === 'running' ? 'running' : pickResumeState(facts),
    }))
    .with('stop', () => ({ kind: 'task.stopped', resumeState: pickHeldState(facts) }))
    .with('restart', () => ({ kind: 'task.restarted', nextState: pickResumeState(facts) }))
    .with('close', () => ({ kind: 'task.closed' }))
    .with('interrupt', () => ({ kind: 'task.interrupted' }))
    .exhaustive();
}

const allowedControls: Readonly<Record<TaskState, readonly TaskControl[]>> = {
  ready: ['pause', 'stop', 'close'],
  running: ['pause', 'resume', 'stop', 'close', 'interrupt'],
  waiting: ['pause', 'stop', 'close'],
  paused: ['resume', 'stop', 'close'],
  stopped: ['restart', 'close'],
  failed: ['restart', 'close'],
  done: ['close'],
  closed: [],
};

function canControl(control: TaskControl, facts: TaskControlFacts): boolean {
  if (!allowedControls[facts.state].includes(control)) {
    return false;
  }

  if (facts.state !== 'running') {
    return true;
  }

  return match(control)
    .with('pause', () => !facts.isPauseRequested)
    .with('resume', () => facts.isPauseRequested)
    .with('stop', 'restart', 'close', 'interrupt', () => true)
    .exhaustive();
}

// A step that never committed runs again, so a task held while ready or running returns to ready.
function pickHeldState(facts: TaskControlFacts): ResumeState {
  if (facts.state === 'waiting') {
    return 'waiting';
  }

  return facts.state === 'paused' ? (facts.resumeState ?? 'ready') : 'ready';
}

function pickResumeState(facts: TaskControlFacts): ResumeState {
  return facts.hasUnread ? 'ready' : (facts.resumeState ?? 'ready');
}
