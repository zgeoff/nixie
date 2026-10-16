import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';

// The memory writer's progress: whether its catch-up over the conversation from before memory
// still runs, where its cursor stands, how many of your messages wait, and its last error.
export function WriterStatusPanel(): ReactNode {
  const nixie = useNixieClient();
  const status = useQuery(nixie.queryUtils.memory.writerStatus.queryOptions());

  if (status.isPending) {
    return <p>Loading the memory writer…</p>;
  }

  if (status.isError) {
    return <p role="alert">The memory writer’s status did not load.</p>;
  }

  const writer = status.data;

  return (
    <section aria-label="Memory writer" className={css({ fontSize: 'sm', marginBlock: '3' })}>
      <p>
        Memory writer: {writer.isCatchingUp ? 'catching up on earlier conversation' : 'caught up'} ·
        at record {writer.cursor.toLocaleString('en')} · {formatBacklog(writer.backlog)}
      </p>
      {writer.lastError === null ? null : (
        <p className={css({ color: 'textMuted' })}>
          Last error: {writer.lastError.code}
          {writer.lastError.message === null ? '' : ` (${writer.lastError.message})`} at{' '}
          {formatTime(writer.lastError.at)}
          {writer.retryAt === null ? '' : `, trying again at ${formatTime(writer.retryAt)}`}
        </p>
      )}
    </section>
  );
}

function formatBacklog(backlog: number): string {
  return backlog === 1 ? '1 message waits' : `${backlog.toLocaleString('en')} messages wait`;
}

function formatTime(date: Date): string {
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}
