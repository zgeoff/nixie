import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';
import { ForgetControl } from './forget-control';
import { ReplyText } from './reply-text';

export interface RecordItemProps {
  readonly record: LiveRecord;
}

// One message of the conversation: yours as you typed it, or a reply rendered as Markdown, with
// the control that forgets it. A message the log forgot keeps its place as a gap with no text.
export function RecordItem(props: RecordItemProps): ReactNode {
  const [isForgotten, setForgotten] = useState(false);
  const text = isForgotten ? undefined : props.record.message?.text;
  const isYours = props.record.kind === 'owner_message';

  return (
    <li>
      <strong className={speaker}>{isYours ? 'You' : 'nixie'}</strong>{' '}
      {text === undefined ? <span className={gap}>Forgotten</span> : null}
      {text !== undefined && isYours ? <span className={message}>{text}</span> : null}
      {text !== undefined && !isYours ? <ReplyText text={text} /> : null}
      {forgettableKinds.has(props.record.kind) ? (
        <ForgetControl
          hasText={text !== undefined}
          onForgotten={() => {
            setForgotten(true);
          }}
          record={props.record}
        />
      ) : null}
    </li>
  );
}

// the records a forget can remove: your message, and a reply from the conversation's model
const forgettableKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

// The speaker sits on its own line above the text.
const speaker = css({ display: 'block', fontWeight: 'semibold' });

// Your message keeps its line breaks and wraps a long word or link inside the column.
const message = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });

// A forgotten message reads as a quiet gap in its place.
const gap = css({ color: 'textMuted', fontStyle: 'italic' });
