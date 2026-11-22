import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { runComputerWatch } from '../computer/run-computer-watch';
import type { StartViewer, WatchState } from '../computer/types';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

export interface ComputerViewProps {
  readonly startViewer: StartViewer;
}

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  marginInline: 'auto',
  maxWidth: '6xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const screen = css({
  aspectRatio: '16 / 10',
  backgroundColor: 'canvas',
  borderColor: 'borderStrong',
  borderRadius: 'md',
  borderWidth: '1px',
  overflow: 'hidden',
  width: '100%',
});

const notice = css({ color: 'textMuted', fontSize: 'sm' });

const messages = {
  connecting: 'Connecting to the computer.',
  waking: 'The computer is waking',
  watching: 'Watching the computer. You can look but not touch.',
  ended: 'The connection to the computer ended.',
  unavailable: 'This nixie has no computer to watch.',
  failed: 'The computer can’t be watched right now.',
} as const satisfies Record<WatchState['kind'], string>;

export function ComputerView(props: ComputerViewProps): ReactNode {
  const nixie = useNixieClient();
  const target = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<WatchState>({ kind: 'connecting' });
  const [attempt, setAttempt] = useState(0);

  // Each attempt asks for its own ticket, because a ticket opens one socket. A new attempt, and
  // leaving the page, end the run before it.
  useEffect(() => {
    const element = target.current;

    const running = new AbortController();

    if (element !== null) {
      void runComputerWatch({
        client: nixie.client,
        target: element,
        startViewer: props.startViewer,
        signal: running.signal,
        onState: setState,
      });
    }

    return () => {
      running.abort();
    };
  }, [attempt, nixie.client, props.startViewer]);

  const isOver = state.kind === 'ended' || state.kind === 'failed';

  return (
    <main className={page}>
      <h1>Computer</h1>
      <p className={notice} role="status">
        {messages[state.kind]}
      </p>
      {isOver ? (
        <div>
          <button
            onClick={() => {
              setAttempt((earlier) => earlier + 1);
            }}
            type="button"
          >
            Watch again
          </button>
        </div>
      ) : null}
      <div aria-label="The computer's desktop" className={screen} ref={target} role="img" />
    </main>
  );
}
