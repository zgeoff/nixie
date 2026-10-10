import type { SpanState } from '@heynixie/contract';
import { buildSpanState } from '@heynixie/contract';
import type { KeyboardEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { usePendingInput } from '../use-pending-input';

export interface ComposerProps {
  readonly onSend: (message: SpanState) => void;
}

const emptyMessage: SpanState = { spans: [], text: '' };

// The message box. It labels every span of the text with how it arrived: beforeinput says how the
// next edit arrives and pins where it lands, and the input event that follows applies it.
export function Composer(props: ComposerProps): ReactNode {
  const [message, setMessage] = useState<SpanState>(emptyMessage);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const pendingInput = usePendingInput(textBox);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

        if (message.text.trim() !== '') {
          props.onSend(message);
          setMessage(emptyMessage);
        }
      }}
    >
      <textarea
        aria-label="Message"
        onChange={(event) => {
          const pending = pendingInput.current;
          const text = event.target.value;

          pendingInput.current = undefined;
          setMessage((current) => buildSpanState(current, pending, text));
        }}
        onKeyDown={handleKeyDown}
        ref={textBox}
        rows={3}
        value={message.text}
      />
      <button type="submit">Send</button>
    </form>
  );
}

// Enter sends the message, and Shift+Enter starts a new line.
function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}
