import type { TaskSetup } from './read-task-setup';
import type { TaskMessageKind } from './types';

export interface TaskReportMessage {
  readonly to: string;
  readonly kind: TaskMessageKind;
  readonly wake: boolean | undefined;
}

export type TaskReportPlan =
  | { readonly status: 'refused' }
  | { readonly status: 'planned'; readonly wake: boolean };

// The report mode binds only a report to the task's starter; every other message keeps its wake.
export function planTaskReport(
  setup: TaskSetup | null,
  message: TaskReportMessage,
): TaskReportPlan {
  const isToStarter = message.kind === 'report' && setup?.startedBy === message.to;
  const report = isToStarter ? (setup.options?.report ?? 'wake') : 'wake';

  if (report === 'none') {
    return { status: 'refused' };
  }

  return { status: 'planned', wake: report === 'next_turn' ? false : (message.wake ?? true) };
}
