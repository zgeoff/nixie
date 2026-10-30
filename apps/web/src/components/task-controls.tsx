import type { TaskControl } from '@heynixie/task-control';
import { isControlAllowed } from '@heynixie/task-control';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatStopPreview } from '../format-stop-preview';
import { runTaskControl } from '../run-task-control';
import { css } from '../styled-system/css';
import type { ListedTask } from '../use-live-task-list';
import { useNixieClient } from '../use-nixie-client';

export interface TaskControlsProps {
  readonly task: ListedTask;
}

interface ControlAttempt {
  readonly clientActionID: string;
  readonly control: TaskControl;
}

const controls = css({
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
});

const status = css({ color: 'textMuted' });

const controlLabels: Readonly<Record<TaskControl, string>> = {
  pause: 'Pause',
  resume: 'Resume',
  stop: 'Stop',
  restart: 'Restart',
  close: 'Close',
  interrupt: 'Interrupt',
};

export function TaskControls(props: TaskControlsProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<'stop' | 'close' | null>(null);
  const [attempt, setAttempt] = useState<ControlAttempt | null>(null);
  const task = props.task;

  const refreshList = (): void => {
    void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.tasks.key() });
  };

  const sent = useMutation({
    mutationFn: (next: ControlAttempt) =>
      runTaskControl(nixie.client, { ...next, taskID: task.taskID }),
    onError: refreshList,
    onSuccess: () => {
      setAttempt(null);
      setConfirming(null);
      refreshList();
    },
  });

  // A control that failed goes again under the same client action ID, so a retry applies it once.
  const send = (control: TaskControl): void => {
    const next =
      attempt?.control === control ? attempt : { clientActionID: crypto.randomUUID(), control };

    setAttempt(next);

    sent.mutate(next);
  };

  const offered = task.controls.filter((control) =>
    isControlAllowed(control, {
      isConversation: task.taskID === 'conversation',
      isPauseRequested: task.isPauseRequested,
      state: task.state,
    }),
  );

  return (
    <div aria-label={`Controls for ${task.name}`} className={controls} role="group">
      {task.isPauseRequested ? (
        <span className={status} role="status">
          Pause requested
        </span>
      ) : null}
      {offered.map((control) => (
        <button
          disabled={sent.isPending}
          key={control}
          onClick={() => {
            if (control === 'stop' || control === 'close') {
              setConfirming(control);
            } else {
              send(control);
            }
          }}
          type="button"
        >
          {controlLabels[control]}
        </button>
      ))}
      {confirming === 'stop' ? (
        <StopConfirmation
          isPending={sent.isPending}
          onConfirm={() => {
            send('stop');
          }}
          onKeep={() => {
            setConfirming(null);
          }}
          taskID={task.taskID}
        />
      ) : null}
      {confirming === 'close' ? (
        <CloseConfirmation
          isPending={sent.isPending}
          name={task.name}
          onConfirm={() => {
            send('close');
          }}
          onKeep={() => {
            setConfirming(null);
          }}
        />
      ) : null}
      {sent.isError && attempt !== null ? (
        <p role="alert">
          The {controlLabels[attempt.control].toLowerCase()} did not finish. Try again.
        </p>
      ) : null}
    </div>
  );
}

interface StopConfirmationProps {
  readonly taskID: string;

  readonly isPending: boolean;
  readonly onConfirm: () => void;
  readonly onKeep: () => void;
}

function StopConfirmation(props: StopConfirmationProps): ReactNode {
  const nixie = useNixieClient();

  const actions = useQuery(
    nixie.queryUtils.tasks.readActions.queryOptions({ input: { taskID: props.taskID } }),
  );

  return (
    <div aria-label="Stop the task" role="group">
      {actions.isPending ? <p>Reading the actions the stop cancels…</p> : null}
      {actions.isError ? (
        <p>
          The actions the stop cancels did not load.{' '}
          <button
            onClick={() => {
              void actions.refetch();
            }}
            type="button"
          >
            Load them again
          </button>
        </p>
      ) : null}
      {actions.data === undefined
        ? null
        : formatStopPreview(actions.data).map((line) => <p key={line}>{line}</p>)}
      <button
        disabled={props.isPending || !actions.isSuccess}
        onClick={props.onConfirm}
        type="button"
      >
        Stop the task
      </button>
      <button disabled={props.isPending} onClick={props.onKeep} type="button">
        Keep it running
      </button>
    </div>
  );
}

interface CloseConfirmationProps {
  readonly name: string;

  readonly isPending: boolean;
  readonly onConfirm: () => void;
  readonly onKeep: () => void;
}

function CloseConfirmation(props: CloseConfirmationProps): ReactNode {
  return (
    <div aria-label="Close the task" role="group">
      <p>Close {props.name} for good? It takes no more messages, and you can still read it.</p>
      <button disabled={props.isPending} onClick={props.onConfirm} type="button">
        Close the task
      </button>
      <button disabled={props.isPending} onClick={props.onKeep} type="button">
        Keep it open
      </button>
    </div>
  );
}
