import { isFinishedState } from '@heynixie/task-control';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { buildTaskHref } from '../build-task-href';
import type { MessageRoute } from '../collect-message-routes';
import { formatTaskName } from '../format-task-name';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';
import { useNixieClient } from '../use-nixie-client';
import type { RoutedTasks } from '../use-routed-tasks';

export interface RoutingMarkProps {
  readonly record: LiveRecord;
  readonly route: MessageRoute | undefined;
  readonly taskList: RoutedTasks;
}

const mark = css({
  alignItems: 'baseline',
  color: 'textMuted',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

const link = css({ color: 'link', textDecoration: 'underline' });

export function RoutingMark(props: RoutingMarkProps): ReactNode {
  const [actionID, setActionID] = useState<string | null>(null);
  const current = props.route?.taskID ?? props.record.thread;

  return (
    <div className={mark}>
      {props.route === undefined ? null : (
        <a className={link} href={buildTaskHref(props.route.taskID)}>
          → {formatTaskName(props.taskList.tasks, props.route.taskID)}
          {props.route.isMove ? ' (moved)' : ''}
        </a>
      )}
      {actionID === null ? (
        <button
          onClick={() => {
            setActionID(crypto.randomUUID());
          }}
          type="button"
        >
          Move
        </button>
      ) : (
        <MoveForm
          actionID={actionID}
          current={current}
          onDone={() => {
            setActionID(null);
          }}
          record={props.record}
          taskList={props.taskList}
        />
      )}
    </div>
  );
}

interface MoveFormProps {
  readonly actionID: string;
  readonly current: string;
  readonly record: LiveRecord;
  readonly taskList: RoutedTasks;
  readonly onDone: () => void;
}

const newTask = 'new';

function MoveForm(props: MoveFormProps): ReactNode {
  const nixie = useNixieClient();

  const targets = props.taskList.tasks.filter(
    (task) =>
      task.taskID !== props.current && task.isTakingMessages && !isFinishedState(task.state),
  );

  const [target, setTarget] = useState(targets[0]?.taskID ?? newTask);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');

  const move = useMutation(
    nixie.queryUtils.conversation.move.mutationOptions({ onSuccess: props.onDone }),
  );

  const isNew = target === newTask;
  const canMove = !move.isPending && (!isNew || (name.trim() !== '' && brief.trim() !== ''));

  return (
    <form
      aria-label="Move this message"
      className={css({ display: 'flex', flexWrap: 'wrap', gap: '2' })}
      onSubmit={(event) => {
        event.preventDefault();

        move.mutate({
          clientActionID: props.actionID,
          sequence: props.record.sequence,
          thread: props.record.thread,
          to: isNew ? { kind: 'new', name, brief } : { kind: 'task', taskID: target },
        });
      }}
    >
      {props.taskList.isFailed ? (
        <p role="alert">
          Your tasks did not load, so only a new task is on offer.{' '}
          <button onClick={props.taskList.onRetry} type="button">
            Load tasks again
          </button>
        </p>
      ) : null}
      <label>
        Move to{' '}
        <select
          onChange={(event) => {
            setTarget(event.target.value);
          }}
          value={target}
        >
          {targets.map((task) => (
            <option key={task.taskID} value={task.taskID}>
              {task.name}
            </option>
          ))}
          <option value={newTask}>A new task</option>
        </select>
      </label>
      {isNew ? (
        <>
          <label>
            Name{' '}
            <input
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
              }}
              value={name}
            />
          </label>
          <label>
            Brief{' '}
            <input
              maxLength={8000}
              onChange={(event) => {
                setBrief(event.target.value);
              }}
              value={brief}
            />
          </label>
        </>
      ) : null}
      <button disabled={!canMove} type="submit">
        Move
      </button>
      <button disabled={move.isPending} onClick={props.onDone} type="button">
        Cancel
      </button>
      {move.isError ? <p role="alert">The move did not finish. Try again.</p> : null}
    </form>
  );
}
