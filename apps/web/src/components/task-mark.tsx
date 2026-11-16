import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { ListedTask } from '../task/use-live-task-list';
import { useNixieClient } from '../utils/use-nixie-client';

export interface TaskMarkProps {
  readonly task: ListedTask;
}

interface MarkAttempt {
  readonly clientActionID: string;
  readonly disposable: boolean;
}

const mark = css({
  alignItems: 'baseline',
  color: 'textMuted',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
});

const closers = {
  owner: undefined,
  nixie: 'Closed by nixie',
  disposable: 'Closed when it finished',
} as const;

// A task with no mark shows nothing. The owner switches the mark of an open task, and the switch
// closes nothing: the Close button does that.
export function TaskMark(props: TaskMarkProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState<MarkAttempt | null>(null);
  const task = props.task;

  const refreshList = (): void => {
    void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.tasks.key() });
  };

  const sent = useMutation({
    mutationFn: (next: MarkAttempt) =>
      nixie.client.tasks.setDisposable({ ...next, taskID: task.taskID }),
    onError: refreshList,
    onSuccess: () => {
      setAttempt(null);
      refreshList();
    },
  });

  if (task.state === 'closed') {
    const closedBy = task.closedBy === undefined ? undefined : closers[task.closedBy];

    return closedBy === undefined ? null : <p className={mark}>{closedBy}</p>;
  }

  if (task.disposable === null) {
    return null;
  }

  const disposable = !task.disposable;

  // A switch that failed goes again under the same client action ID, so a retry applies it once.
  const send = (): void => {
    const next =
      attempt?.disposable === disposable
        ? attempt
        : { clientActionID: crypto.randomUUID(), disposable };

    setAttempt(next);

    sent.mutate(next);
  };

  return (
    <div aria-label={`Mark for ${task.name}`} className={mark} role="group">
      {task.state === 'done' ? (
        <span>{task.disposable ? 'Closes when it finishes' : 'Kept open'}</span>
      ) : (
        <button
          aria-checked={task.disposable}
          disabled={sent.isPending}
          onClick={send}
          role="switch"
          type="button"
        >
          Close when it finishes
        </button>
      )}
      {sent.isError ? <span role="alert">The change did not finish. Try again.</span> : null}
    </div>
  );
}
