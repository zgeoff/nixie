import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { formatPauseCause } from '../pause/format-pause-cause';
import { useNixieControl } from '../pause/use-nixie-control';
import { usePauseState } from '../pause/use-pause-state';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { PauseRecoveryList } from './pause-recovery-list';

const banner = css({
  borderBlockEnd: '1px solid',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 'sm',
  gap: '2',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

const timeFormat: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
};

export function PauseBanner(): ReactNode {
  const read = usePauseState();
  const resume = useNixieControl('resume');
  const paused = read.data?.paused ?? null;

  useRefreshTasksOnRead(read.dataUpdatedAt);

  if (paused === null) {
    return null;
  }

  return (
    <section aria-label="nixie is paused" className={banner}>
      <p role="status">
        nixie is paused by {formatPauseCause(paused.cause)} since{' '}
        {paused.since.toLocaleString(undefined, timeFormat)}. No task takes a new step until you
        resume it.
      </p>
      {paused.cause === 'restore' ? <PauseRecoveryList /> : null}
      <div>
        <button disabled={resume.isPending} onClick={resume.onSend} type="button">
          Resume nixie
        </button>
      </div>
      {resume.isError ? <p role="alert">The resume did not finish. Try again.</p> : null}
    </section>
  );
}

// Each task shows whether the pause holds it, and a task's own resume from the host or another
// device leaves the pause as it was. Every fresh read of the pause therefore refreshes the list.
function useRefreshTasksOnRead(readAt: number): void {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (readAt === 0) {
      return;
    }

    if (previous.current !== null && previous.current !== readAt) {
      void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.tasks.key() });
    }

    previous.current = readAt;
  }, [readAt, nixie, queryClient]);
}
