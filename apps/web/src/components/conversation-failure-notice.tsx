import type { ReactNode } from 'react';
import { findConversationFailure } from '../find-conversation-failure';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';

export interface ConversationFailureNoticeProps {
  readonly records: readonly LiveRecord[];
}

// Sits above the messages while the conversation's turns fail at or past the error limit, and goes
// once a turn succeeds. The conversation keeps trying, and your next message makes it try at once.
export function ConversationFailureNotice(props: ConversationFailureNoticeProps): ReactNode {
  const failure = findConversationFailure(props.records);

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

const notice = css({
  color: 'textMuted',
  fontSize: 'sm',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});
