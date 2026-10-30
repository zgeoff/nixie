import type { ReactNode, Ref } from 'react';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';

export interface TaskMessageBlockProps {
  readonly message: NonNullable<LiveRecord['taskMessage']>;

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

const meta = css({ color: 'textMuted', fontSize: 'sm' });
const body = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });

export function TaskMessageBlock(props: TaskMessageBlockProps): ReactNode {
  const message = props.message;

  return (
    <li
      aria-label={`Message from ${message.fromName}`}
      className={frame}
      id={`task-message-${message.messageID}`}
      ref={props.ref}
    >
      <span className={meta}>
        From {message.fromName} · {message.kind} · hop {message.hop}
        {message.woke ? '' : ' · did not wake its receiver'}
      </span>
      <span className={body}>{message.text ?? 'This message was forgotten.'}</span>
    </li>
  );
}
