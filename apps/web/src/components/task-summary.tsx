import type { ReactNode } from 'react';
import { buildTaskHref } from '../build-task-href';
import { formatTaskName } from '../format-task-name';
import { formatTaskState } from '../format-task-state';
import { css } from '../styled-system/css';
import { useIsHydrated } from '../use-is-hydrated';
import type { ListedTask } from '../use-live-task-list';
import { TaskControls } from './task-controls';

export interface TaskSummaryProps {
  readonly task: ListedTask;
  readonly tasks: readonly ListedTask[];

  readonly isLinked: boolean;
}

const summary = css({ display: 'flex', flexDirection: 'column', gap: '1' });
const titleRow = css({ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: '2' });
const title = css({ fontWeight: 'semibold' });
const link = css({ color: 'link', textDecoration: 'underline' });
const facts = css({ color: 'textMuted', fontSize: 'sm' });
const brief = css({ lineClamp: '2', overflowWrap: 'anywhere' });

const timeFormat: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
};

export function TaskSummary(props: TaskSummaryProps): ReactNode {
  const task = props.task;
  const isHydrated = useIsHydrated();

  const waiters = props.tasks
    .filter((other) => other.waitingOn === task.taskID)
    .map((other) => other.name);

  return (
    <div className={summary}>
      <div className={titleRow}>
        {props.isLinked ? (
          <a className={`${title} ${link}`} href={buildTaskHref(task.taskID)}>
            {task.name}
          </a>
        ) : (
          <span className={title}>{task.name}</span>
        )}
        <span className={facts}>{formatTaskState(task.state)}</span>
        {isHydrated ? (
          <span className={facts}>
            Last activity {task.lastActivityAt.toLocaleString(undefined, timeFormat)}
          </span>
        ) : null}
      </div>
      {task.brief === '' ? null : <p className={brief}>{task.brief}</p>}
      {task.waitingOn === undefined ? null : (
        <p className={facts}>Waiting on {formatTaskName(props.tasks, task.waitingOn)}</p>
      )}
      {waiters.length === 0 ? null : (
        <p className={facts}>
          {waiters.join(', ')} {waiters.length === 1 ? 'is' : 'are'} waiting on this task
        </p>
      )}
      {task.actions.queued + task.actions.started === 0 ? null : (
        <p className={facts}>
          Actions: {task.actions.queued} queued, {task.actions.started} started
        </p>
      )}
      <TaskControls task={task} />
    </div>
  );
}
