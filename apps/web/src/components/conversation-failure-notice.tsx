import type { ReactNode } from 'react';
import { findConversationFailure } from '../find-conversation-failure';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';

export interface ConversationFailureNoticeProps {
  readonly records: readonly LiveRecord[];

  readonly lastStepEnd?: LiveRecord | null | undefined;
}

const notice = css({
  color: 'textMuted',
  fontSize: 'sm',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

export function ConversationFailureNotice(props: ConversationFailureNoticeProps): ReactNode {
  const lastStepEnd = props.lastStepEnd ?? null;
  const records = lastStepEnd === null ? props.records : [lastStepEnd, ...props.records];
  const failure = findConversationFailure(records);

  if (failure === null) {
    return null;
  }

  const time = failure.retryAt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <p className={notice} role="alert">
      nixie failed to answer {failure.errors} times in a row. It tries again at {time}, or when you
      send a message.
    </p>
  );
}
