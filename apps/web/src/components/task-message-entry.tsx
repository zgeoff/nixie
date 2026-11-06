import type { ReactNode, Ref } from 'react';
import { match } from 'ts-pattern';
import type { TaskMessageActivity } from '../build-activity';
import { buildTaskHref } from '../build-task-href';
import { css } from '../styled-system/css';
import { useTaskName } from '../use-task-name';

export type TaskMessageLayout = 'line' | 'block';

export interface TaskMessageEntryProps {
  readonly message: TaskMessageActivity;
  readonly layout: TaskMessageLayout;

  readonly ref?: Ref<HTMLLIElement> | undefined;
}

const frame = css({
  borderColor: 'border',
  borderRadius: 'md',
  borderWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  paddingBlock: '2',
  paddingInline: '3',
});

const quiet = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });
const body = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });

export function TaskMessageEntry(props: TaskMessageEntryProps): ReactNode {
  const message = props.message;
  const name = useTaskName(message.taskID, message.taskName);
  const id = `task-message-${message.messageID}`;
  const label = `Message ${message.direction === 'received' ? 'from' : 'to'} ${name}`;

  return match(props.layout)
    .with('line', () => (
      <li aria-label={label} className={quiet} id={id} ref={props.ref}>
        <a className={link} href={`${buildTaskHref(message.taskID)}#${id}`}>
          {message.direction === 'received'
            ? `Received a message from ${name}`
            : `Sent a message to ${name}`}
        </a>
      </li>
    ))
    .with('block', () => (
      <li aria-label={label} className={frame} id={id} ref={props.ref}>
        <span className={quiet}>
          {message.direction === 'received' ? 'From' : 'To'} {name} · {message.kind} · hop{' '}
          {message.hop}
          {message.woke ? '' : ' · did not wake its receiver'}
        </span>
        <span className={body}>{message.text ?? 'This message was forgotten.'}</span>
      </li>
    ))
    .exhaustive();
}
