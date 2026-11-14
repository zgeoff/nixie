import { forgettableKinds } from '@heynixie/contract';
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

const forgettable: readonly string[] = forgettableKinds;
const speaker = css({ display: 'block', fontWeight: 'semibold' });
const message = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });

export function RecordItem(props: RecordItemProps): ReactNode {
  const [isForgotten, setForgotten] = useState(false);
  const [isForgetOpen, setForgetOpen] = useState(false);
  const isRemoved = isForgotten || props.record.isRemoved === true;
  const text = isRemoved ? undefined : props.record.message?.text;
  const isYours = props.record.kind === 'owner_message';
  const images = props.record.message?.images?.length ?? 0;

  if (text === undefined && !isRemoved && !isForgetOpen) {
    return null;
  }

  // A forget that has not finished keeps its control on a removed message, so the owner can try again.
  const hasControl = forgettable.includes(props.record.kind) && (!isRemoved || isForgetOpen);

  return (
    <li>
      <strong className={speaker}>{isYours ? 'You' : 'nixie'}</strong>{' '}
      {isRemoved ? '— removed' : null}
      {text !== undefined && isYours ? <span className={message}>{text}</span> : null}
      {text !== undefined && isYours && images > 0 ? (
        <MessageImages
          count={images}
          sequence={props.record.sequence}
          thread={props.record.thread}
        />
      ) : null}
      {text !== undefined && !isYours ? <ReplyText text={text} /> : null}
      {hasControl ? (
        <ForgetControl
          hasText={text !== undefined}
          kind={props.record.kind}
          label="Forget"
          onForgotten={() => {
            setForgotten(true);
          }}
          onOpenChange={setForgetOpen}
          sequence={props.record.sequence}
          thread={props.record.thread}
        />
      ) : null}
    </li>
  );
}
