import type { ContractOutputs } from '@heynixie/contract';

type TaskActions = ContractOutputs['tasks']['readActions'];

export function formatStopPreview(actions: TaskActions): readonly string[] {
  const queued = actions.queued.map((action) => action.tool).join(', ');
  const started = actions.started.map((action) => action.tool).join(', ');

  return [
    actions.queued.length === 0
      ? 'The stop cancels no queued action.'
      : `The stop cancels ${formatActionCount(actions.queued.length)} not yet started: ${queued}.`,
    ...(actions.started.length === 0
      ? []
      : [`Already started, so it runs to its outcome: ${started}.`]),
  ];
}

function formatActionCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'action' : 'actions'}`;
}
