import { ORPCError } from '@orpc/client';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { bindClipboard } from '../computer/bind-clipboard';
import { buildPasteKeys } from '../computer/build-paste-keys';
import { runComputerWatch } from '../computer/run-computer-watch';
import type { LoadViewer, Viewer, WatchState } from '../computer/types';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

export interface ComputerViewProps {
  readonly loadViewer: LoadViewer;

  // takes over once, as soon as the desktop shows: the user pressed Take over on the handover banner
  readonly startsTakeOver?: boolean;
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
  waking: 'The computer is waking.',
  watching: "Your input won't reach the computer until you take over.",
  ended: 'The connection to the computer ended.',
  unavailable: 'This nixie has no computer to watch.',
  failed: 'The computer can’t be watched right now.',
} as const satisfies Record<WatchState['kind'], string>;

const holdEndedMessage = 'Your hold on the computer ended.';

// A paste is typed key by key, so a long one would flood the connection to the desktop.
const maxPasteCharacters = 2000;
const tooLongToPaste = `That text is too long to paste. Paste up to ${String(maxPasteCharacters)} characters at a time.`;

export function ComputerView(props: ComputerViewProps): ReactNode {
  const nixie = useNixieClient();
  const target = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<WatchState>({ kind: 'connecting' });
  const [attempt, setAttempt] = useState(0);
  const [takeover, setTakeover] = useState<TakeoverState>({ kind: 'watching' });
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const isHoldingNow = useRef(false);

  // the text the desktop copied that the browser would not put on the clipboard, for the button
  const [uncopied, setUncopied] = useState<string | null>(null);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

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
        onCopy: (text) => {
          if (isHoldingNow.current) {
            void copyToClipboard(text, setUncopied);
          }
        },
      });
    }

    return () => {
      running.abort();
    };
  }, [attempt, nixie.client, props.loadViewer]);

  const isHolding = takeover.kind === 'holding';

  isHoldingNow.current = isHolding;

  // The viewer sends the person's keys only while this device holds the desktop, and a new viewer
  // after a reconnect starts view only, so it takes the state again.
  useEffect(() => {
    viewer?.setInput(isHolding);
  }, [viewer, isHolding]);

  // A paste is the one time the page hands the user's clipboard to the desktop, and only while this
  // device holds it.
  useEffect(() => {
    const element = target.current;

    if (viewer === null || element === null || !isHolding) {
      return () => {};
    }

    return bindClipboard(element, {
      onPaste: (text) => {
        if (buildPasteKeys(text).length > maxPasteCharacters) {
          setPasteNotice(tooLongToPaste);

          return;
        }

        setPasteNotice(null);

        viewer.paste(text);
      },
    });
  }, [viewer, isHolding]);

  // Neither the copied text nor the notice outlives the hold.
  useEffect(() => {
    if (!isHolding) {
      setUncopied(null);
      setPasteNotice(null);
    }
  }, [isHolding]);

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

  const hasAutoTakeOver = useRef(false);

  useEffect(() => {
    if (
      props.startsTakeOver === true &&
      !hasAutoTakeOver.current &&
      state.kind === 'watching' &&
      takeover.kind === 'watching'
    ) {
      hasAutoTakeOver.current = true;
      void takeOver();
    }
  });

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
        {isHolding && uncopied !== null ? (
          <span className={notice} role="alert">
            Your browser would not copy the text that the computer copied.{' '}
            <button
              onClick={() => {
                void copyToClipboard(uncopied, setUncopied);
              }}
              type="button"
            >
              Copy it
            </button>
          </span>
        ) : null}
        {pasteNotice === null ? null : (
          <span className={notice} role="alert">
            {pasteNotice}
          </span>
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

// Puts the text on the user's clipboard. A browser may refuse a write that no gesture asked for, and
// then the page keeps the text for a button, whose press is a gesture.
async function copyToClipboard(
  text: string,
  keep: (uncopied: string | null) => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);

    keep(null);
  } catch {
    keep(text);
  }
}

const takeoverRefusals: Record<string, string> = {
  NOT_TAKEN_OVER: holdEndedMessage,
  BUSY_TOO_LONG: 'The assistant is mid-action. Try again in a moment.',
  HELD_ELSEWHERE: 'Another device holds the computer.',
  COMPUTER_UNAVAILABLE: 'This nixie has no computer to take over.',
};

function toRefusal(error: unknown): string {
  return (
    (error instanceof ORPCError && typeof error.code === 'string'
      ? takeoverRefusals[error.code]
      : undefined) ?? 'The computer can’t be taken over right now.'
  );
}
