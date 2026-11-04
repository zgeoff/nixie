import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ConversationFailure } from '../find-conversation-failure';
import { findConversationFailure } from '../find-conversation-failure';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';
import { useNixieClient } from '../use-nixie-client';

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

  return (
    <div className={notice}>
      <p role="alert">{renderFailure(failure)}</p>
      <RetryControl />
    </div>
  );
}

function renderFailure(failure: ConversationFailure): string {
  const opening =
    failure.cause === null
      ? `nixie failed to answer ${failure.errors} times in a row.`
      : `nixie failed to answer: ${failure.cause}.`;

  if (failure.retryAt === null) {
    return `${opening} It waits until you retry or send a message.`;
  }

  const time = failure.retryAt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${opening} It tries again at ${time}, or when you send a message.`;
}

function RetryControl(): ReactNode {
  const nixie = useNixieClient();
  const retry = useMutation(nixie.queryUtils.conversation.retry.mutationOptions());

  return (
    <p>
      <button
        disabled={retry.isPending}
        onClick={() => {
          retry.mutate({ clientActionID: crypto.randomUUID() });
        }}
        type="button"
      >
        {retry.isPending ? 'Retrying…' : 'Retry'}
      </button>
      {retry.isError ? <span role="status"> The retry did not go through.</span> : null}
    </p>
  );
}
