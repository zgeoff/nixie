import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';
import { ForgetControl } from './forget-control';
import { MessageImages } from './message-images';
import { ReplyText } from './reply-text';

export interface RecordItemProps {
  readonly record: LiveRecord;
}

const forgettableKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

const speaker = css({ display: 'block', fontWeight: 'semibold' });
const message = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });
const gap = css({ color: 'textMuted', fontStyle: 'italic' });

export function RecordItem(props: RecordItemProps): ReactNode {
  const [isForgotten, setForgotten] = useState(false);
  const text = isForgotten ? undefined : props.record.message?.text;
  const isYours = props.record.kind === 'owner_message';
  const images = props.record.message?.images?.length ?? 0;

  return (
    <li>
      <strong className={speaker}>{isYours ? 'You' : 'nixie'}</strong>{' '}
      {text === undefined ? <span className={gap}>Forgotten</span> : null}
      {text !== undefined && isYours ? <span className={message}>{text}</span> : null}
      {text !== undefined && isYours && images > 0 ? (
        <MessageImages
          count={images}
          sequence={props.record.sequence}
          thread={props.record.thread}
        />
      ) : null}
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
