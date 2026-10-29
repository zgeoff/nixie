import type { ListedTask } from '@heynixie/tasks';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

export function renderTaskBoard(
  tasks: readonly ListedTask[],
  times: MessageTimeOptions,
): string | null {
  if (tasks.length === 0) {
    return null;
  }

  return [
    'Your tasks, the most recently active first. Pass work to one of them with task.message, and start a task with task.start only when none of them covers the work.',
    ...tasks.map((task) => renderTaskLine(task, times)),
  ].join('\n');
}

// Every turn repeats the board, so a long brief would cost its full length in each one, and
// tasks.list gives the whole brief.
const briefLimit = 200;

function renderTaskLine(task: ListedTask, times: MessageTimeOptions): string {
  const parts = [
    `[${task.id}] ${task.name}`,
    task.state,
    `last active ${formatMessageTime(task.lastActivityAt, null, times)}`,
    ...(task.waitingOn === undefined ? [] : [`waits on ${task.waitingOn}`]),
  ];

  const brief = task.brief.replaceAll(/\s+/gu, ' ').trim();
  const shown = brief.length > briefLimit ? `${brief.slice(0, briefLimit).trimEnd()}…` : brief;

  return `- ${parts.join(' · ')}${shown === '' ? '' : `\n  ${shown}`}`;
}
