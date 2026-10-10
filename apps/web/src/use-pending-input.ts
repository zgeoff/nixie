import type { PendingInput } from '@heynixie/contract';
import { buildPendingInput } from '@heynixie/contract';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

// Holds how the next edit to a text box arrives, from its beforeinput event, until the input
// event applies it. React's onBeforeInput is a synthetic event without inputType, so the hook
// listens on the element itself.
export function usePendingInput(
  textBox: RefObject<HTMLTextAreaElement | null>,
): RefObject<PendingInput | undefined> {
  const pendingInput = useRef<PendingInput | undefined>(undefined);

  useEffect(() => {
    const element = textBox.current;
    const listening = new AbortController();

    element?.addEventListener(
      'beforeinput',
      (event) => {
        pendingInput.current = buildPendingInput({
          inputType: event.inputType,
          selectionEnd: element.selectionEnd,
          selectionStart: element.selectionStart,
        });
      },
      { signal: listening.signal },
    );

    return () => {
      listening.abort();
    };
  }, [textBox]);

  return pendingInput;
}
