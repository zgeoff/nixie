import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { collectDashboardGroups } from '../task/collect-dashboard-groups';
import type { ListedTask } from '../task/use-live-task-list';
import { useLiveTaskList } from '../task/use-live-task-list';
import { useTaskDefinitions } from '../task/use-task-definitions';
import type { StartTimer } from '../utils/start-platform-timer';
import { PauseNixieButton } from './pause-nixie-button';
import { TaskFilters } from './task-filters';
import type { DashboardFilters } from './task-filters';
import { TaskSummary } from './task-summary';

export interface TaskDashboardProps {
  readonly filters: DashboardFilters;
  readonly startTimer?: StartTimer;

  readonly onFiltersChange: (filters: DashboardFilters) => void;
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
  const filters = props.filters;

  const listed = useLiveTaskList({
    ...(props.startTimer === undefined ? {} : { startTimer: props.startTimer }),
    ...(filters.definition === undefined ? {} : { definitionID: filters.definition }),
    ...(filters.state === undefined ? {} : { state: filters.state }),
  });

  const definitions = useTaskDefinitions();
  const groups = collectDashboardGroups(listed.tasks);
  const isFiltered = filters.definition !== undefined || filters.state !== undefined;

  // The state filter hides tasks, so a list with none of a definition says nothing of whether
  // the server knows definitions.
  const isDefinitionShown =
    isFiltered || listed.tasks.some((task) => task.definitionID !== undefined);

  const hasMatch =
    groups.conversation !== undefined || groups.working.length > 0 || groups.held.length > 0;

  const isGroupShown = (count: number) => !isFiltered || !hasMatch || count > 0;

  return (
    <main className={page}>
      <h1>Tasks</h1>
      <PauseNixieButton />
      <TaskFilters
        definitions={definitions}
        filters={filters}
        isDefinitionShown={isDefinitionShown}
        onFiltersChange={props.onFiltersChange}
      />
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
      {isGroupShown(groups.working.length) ? (
        <TaskGroup label="Working" tasks={groups.working} listed={listed.tasks} />
      ) : null}
      {isGroupShown(groups.held.length) ? (
        <TaskGroup label="Held" tasks={groups.held} listed={listed.tasks} />
      ) : null}
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
