import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import type { ListedTask } from '../task/use-live-task-list';
import { useLiveTaskList } from '../task/use-live-task-list';
import type { StartTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { Conversation } from './conversation';
import { TaskMark } from './task-mark';
import { TaskSummary } from './task-summary';

export interface TaskPageProps {
  readonly taskID: string;

  readonly messageID?: string;
  readonly startTimer?: StartTimer;
}

export function TaskPage(props: TaskPageProps): ReactNode {
  const nixie = useNixieClient();
  const timerOptions = props.startTimer === undefined ? {} : { startTimer: props.startTimer };
  const listed = useLiveTaskList(timerOptions);

  const read = useQuery({
    ...nixie.queryUtils.tasks.read.queryOptions({ input: { taskID: props.taskID } }),
    staleTime: routeDataStaleTimeMs,
  });

  const task = read.data;
  const messageOptions = props.messageID === undefined ? {} : { messageID: props.messageID };

  return (
    <Conversation
      {...messageOptions}
      composerNotice={renderComposerNotice(task, read.isError, () => {
        void read.refetch();
      })}
      taskHeader={
        task === undefined ? undefined : (
          <>
            <TaskSummary isLinked={false} task={task} tasks={listed.tasks} />
            <TaskMark task={task} />
          </>
        )
      }
      thread={props.taskID}
      {...timerOptions}
    />
  );
}

function renderComposerNotice(
  task: ListedTask | undefined,
  isError: boolean,
  onRetry: () => void,
): ReactNode {
  if (task !== undefined) {
    return task.state === 'closed' ? (
      <p>This task is closed, so it takes no more messages.</p>
    ) : undefined;
  }

  return isError ? (
    <p role="alert">
      The task did not load.{' '}
      <button onClick={onRetry} type="button">
        Load it again
      </button>
    </p>
  ) : (
    <p>Loading the task…</p>
  );
}
