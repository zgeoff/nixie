import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';
import { ReplyText } from './reply-text';

export interface RecordItemProps {
  readonly record: LiveRecord;
}

// One message of the conversation: yours as you typed it, or a reply rendered as Markdown. A
// message the log forgot keeps its place with no text.
export function RecordItem(props: RecordItemProps): ReactNode {
  const text = props.record.message?.text ?? '';

  if (props.record.kind !== 'owner_message') {
    return (
      <li>
        <strong className={speaker}>nixie</strong> <ReplyText text={text} />
      </li>
    );
  }

  return (
    <li>
      <strong className={speaker}>You</strong> <span className={message}>{text}</span>
    </li>
  );
}

// The speaker sits on its own line above the text.
const speaker = css({ display: 'block', fontWeight: 'semibold' });

// Your message keeps its line breaks and wraps a long word or link inside the column.
const message = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });
