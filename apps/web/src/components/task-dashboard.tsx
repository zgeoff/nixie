import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { collectDashboardGroups } from '../task/collect-dashboard-groups';
import type { ListedTask } from '../task/use-live-task-list';
import { useLiveTaskList } from '../task/use-live-task-list';
import type { StartTimer } from '../utils/start-platform-timer';
import { PauseNixieButton } from './pause-nixie-button';
import { TaskSummary } from './task-summary';

export interface TaskDashboardProps {
  readonly startTimer?: StartTimer;
}

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const notice = css({ color: 'textMuted', fontSize: 'sm' });

export function TaskDashboard(props: TaskDashboardProps): ReactNode {
  const timerOptions = props.startTimer === undefined ? {} : { startTimer: props.startTimer };
  const listed = useLiveTaskList(timerOptions);
  const groups = collectDashboardGroups(listed.tasks);

  return (
    <main className={page}>
      <h1>Tasks</h1>
      <PauseNixieButton />
      {listed.unavailable ? (
        <p className={notice} role="status">
          Live updates unavailable
        </p>
      ) : null}
      {listed.status === 'pending' ? <p>Loading your tasks…</p> : null}
      {listed.status === 'failed' ? (
        <p role="alert">
          Your tasks did not load.{' '}
          <button onClick={listed.onRetry} type="button">
            Load them again
          </button>
        </p>
      ) : null}
      {groups.conversation === undefined ? null : (
        <TaskGroup label="Conversation" tasks={[groups.conversation]} listed={listed.tasks} />
      )}
      <TaskGroup label="Working" tasks={groups.working} listed={listed.tasks} />
      <TaskGroup label="Held" tasks={groups.held} listed={listed.tasks} />
    </main>
  );
}

interface TaskGroupProps {
  readonly label: string;
  readonly listed: readonly ListedTask[];
  readonly tasks: readonly ListedTask[];
}

const list = css({ display: 'flex', flexDirection: 'column', gap: '4' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });

function TaskGroup(props: TaskGroupProps): ReactNode {
  return (
    <section aria-label={props.label}>
      <h2 className={heading}>{props.label}</h2>
      {props.tasks.length === 0 ? (
        <p className={notice}>No tasks here.</p>
      ) : (
        <ul className={list}>
          {props.tasks.map((task) => (
            <li aria-label={task.name} key={task.taskID}>
              <TaskSummary isLinked task={task} tasks={props.listed} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
