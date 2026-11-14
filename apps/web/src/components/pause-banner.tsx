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
  const observed = read.data === undefined ? undefined : paused;

  useRefreshTasksOnChange(observed);

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

interface ObservedPause {
  readonly cause: string;
  readonly since: Date;
}

// Each task shows whether the pause holds it, so a change of the pause changes the list.
function useRefreshTasksOnChange(paused: ObservedPause | null | undefined): void {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  const current = paused === undefined ? undefined : toPauseKey(paused);

  useEffect(() => {
    if (current === undefined) {
      return;
    }

    if (previous.current !== undefined && previous.current !== current) {
      void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.tasks.key() });
    }

    previous.current = current;
  }, [current, nixie, queryClient]);
}

function toPauseKey(paused: ObservedPause | null): string | null {
  return paused === null ? null : `${paused.cause}@${String(paused.since.getTime())}`;
}
