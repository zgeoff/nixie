import { match } from 'ts-pattern';
import { isControlAllowed } from './is-control-allowed';
import type {
  ResumeState,
  TaskControl,
  TaskControlFacts,
  TaskControlPlan,
  TaskControlRefusal,
} from './types';

export function planTaskControl(
  control: TaskControl,
  facts: TaskControlFacts,
): TaskControlPlan | TaskControlRefusal {
  if (control === 'close' && facts.isConversation) {
    return { reason: 'conversation_never_closes' };
  }

  if (!isControlAllowed(control, facts)) {
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
