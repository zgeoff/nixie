import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { StartTimer } from '../start-platform-timer';
import type { ListedTask } from '../use-live-task-list';
import { useLiveTaskList } from '../use-live-task-list';
import { useNixieClient } from '../use-nixie-client';
import { Conversation } from './conversation';
import { TaskSummary } from './task-summary';

export interface TaskPageProps {
  readonly taskID: string;
  readonly navigation: ReactNode;

  readonly messageID?: string;
  readonly startTimer?: StartTimer;
}

export function TaskPage(props: TaskPageProps): ReactNode {
  const nixie = useNixieClient();
  const timerOptions = props.startTimer === undefined ? {} : { startTimer: props.startTimer };
  const listed = useLiveTaskList(timerOptions);

  const read = useQuery(
    nixie.queryUtils.tasks.read.queryOptions({ input: { taskID: props.taskID } }),
  );

  const task = read.data;
  const messageOptions = props.messageID === undefined ? {} : { messageID: props.messageID };

  return (
    <Conversation
      {...messageOptions}
      composerNotice={renderComposerNotice(task, read.isError, () => {
        void read.refetch();
      })}
      navigation={props.navigation}
      taskHeader={
        task === undefined ? undefined : (
          <TaskSummary isLinked={false} task={task} tasks={listed.tasks} />
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
