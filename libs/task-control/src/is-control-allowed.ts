import { match } from 'ts-pattern';
import type { TaskControl, TaskControlFacts, TaskState } from './types';

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

export function isControlAllowed(
  control: TaskControl,
  facts: Pick<TaskControlFacts, 'state' | 'isConversation' | 'isPauseRequested'>,
): boolean {
  if (control === 'close' && facts.isConversation) {
    return false;
  }

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
