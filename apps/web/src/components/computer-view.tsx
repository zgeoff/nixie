import { ORPCError } from '@orpc/client';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { runComputerWatch } from '../computer/run-computer-watch';
import type { LoadViewer, Viewer, WatchState } from '../computer/types';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

export interface ComputerViewProps {
  readonly loadViewer: LoadViewer;
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
const controls = css({ alignItems: 'center', display: 'flex', gap: '3' });

type TakeoverState =
  | { readonly kind: 'watching' }
  | { readonly kind: 'taking' }
  | { readonly kind: 'holding' }
  | { readonly kind: 'refused'; readonly message: string };

const messages = {
  connecting: 'Connecting to the computer.',
  waking: 'The computer is waking',
  watching: 'Watching the computer. Take over to use it.',
  ended: 'The connection to the computer ended.',
  unavailable: 'This nixie has no computer to watch.',
  failed: 'The computer can’t be watched right now.',
} as const satisfies Record<WatchState['kind'], string>;

const holdEndedMessage = 'Your hold on the computer ended.';

export function ComputerView(props: ComputerViewProps): ReactNode {
  const nixie = useNixieClient();
  const target = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<WatchState>({ kind: 'connecting' });
  const [attempt, setAttempt] = useState(0);
  const [takeover, setTakeover] = useState<TakeoverState>({ kind: 'watching' });
  const [viewer, setViewer] = useState<Viewer | null>(null);

  // Each attempt asks for its own ticket, because a ticket opens one socket. A new attempt, and
  // leaving the page, end the run before it.
  useEffect(() => {
    const element = target.current;

    const running = new AbortController();

    if (element !== null) {
      void runComputerWatch({
        client: nixie.client,
        target: element,
        loadViewer: props.loadViewer,
        signal: running.signal,
        onState: setState,
        onViewer: setViewer,
      });
    }

    return () => {
      running.abort();
    };
  }, [attempt, nixie.client, props.loadViewer]);

  const isHolding = takeover.kind === 'holding';

  // The viewer sends the person's keys only while this device holds the desktop, and a new viewer
  // after a reconnect starts view only, so it takes the state again.
  useEffect(() => {
    viewer?.setInput(isHolding);
  }, [viewer, isHolding]);

  const isOver = state.kind === 'ended' || state.kind === 'failed';

  // The server closes the holder's stream when a hold ends without the holder, by the idle time or a
  // restart, and a stream that ended holds no desktop whatever the buttons last said.
  useEffect(() => {
    if (isOver && isHolding) {
      setTakeover({ kind: 'refused', message: holdEndedMessage });
    }
  }, [isOver, isHolding]);

  const takeOver = async (): Promise<void> => {
    setTakeover({ kind: 'taking' });

    try {
      await nixie.client.computer.takeOver({ clientActionID: crypto.randomUUID() });

      setTakeover({ kind: 'holding' });
    } catch (error) {
      setTakeover({ kind: 'refused', message: toRefusal(error) });
    }
  };

  const handBack = async (): Promise<void> => {
    try {
      await nixie.client.computer.handBack({ clientActionID: crypto.randomUUID() });

      // the server ends every stream of this device with the hold, this tab's too, so it watches again
      setTakeover({ kind: 'watching' });
      setAttempt((earlier) => earlier + 1);
    } catch (error) {
      setTakeover({ kind: 'refused', message: toRefusal(error) });
    }
  };

  return (
    <main className={page}>
      <h1>Computer</h1>
      <p className={notice} role="status">
        {isHolding
          ? 'You have taken over the computer. Your keys and pointer reach it.'
          : messages[state.kind]}
      </p>
      <div className={controls}>
        {isHolding ? (
          <button
            onClick={() => {
              void handBack();
            }}
            type="button"
          >
            Hand back
          </button>
        ) : (
          <button
            disabled={state.kind !== 'watching' || takeover.kind === 'taking'}
            onClick={() => {
              void takeOver();
            }}
            type="button"
          >
            Take over
          </button>
        )}
        {takeover.kind === 'refused' ? (
          <span className={notice} role="alert">
            {takeover.message}
          </span>
        ) : null}
      </div>
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

const takeoverRefusals: Record<string, string> = {
  NOT_TAKEN_OVER: holdEndedMessage,
  BUSY_TOO_LONG: 'The assistant is mid-action. Try again in a moment.',
  HELD_ELSEWHERE: 'Another device holds the computer.',
  COMPUTER_UNAVAILABLE: 'This nixie has no computer to take over.',
};

function toRefusal(error: unknown): string {
  return (
    (error instanceof ORPCError ? takeoverRefusals[error.code] : undefined) ??
    'The computer can’t be taken over right now.'
  );
}
