import type { GateCaller, TaskHoldReason } from '../types';

// What a caller does with a task that a hold stands on. An unstarted work is an action with no
// attempt: one with a started attempt runs on.
export type GateRule = 'skip' | 'skip_unstarted' | 'pass';

const rules: Readonly<Record<GateCaller, Readonly<Record<TaskHoldReason, GateRule>>>> = {
  // a task at a limit is claimed once, and its step start writes task.paused
  task_claim: { ended: 'skip', spend: 'skip', nixie: 'skip', limit: 'pass', task: 'skip' },

  // an ended task's action goes by the task's state: a stop cancels it, a closed task bars an
  // unstarted one, and a done or failed task's action runs
  action: {
    ended: 'pass',
    spend: 'skip',
    nixie: 'skip',
    limit: 'skip_unstarted',
    task: 'skip_unstarted',
  },

  // a reminder still lands in a conversation that its owner paused
  conversation_trigger: {
    ended: 'pass',
    spend: 'skip',
    nixie: 'skip',
    limit: 'pass',
    task: 'pass',
  },
};

export function pickGateRule(caller: GateCaller, reason: TaskHoldReason): GateRule {
  return rules[caller][reason];
}
