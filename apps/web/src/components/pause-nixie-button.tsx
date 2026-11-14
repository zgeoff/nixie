import type { ReactNode } from 'react';
import { useNixieControl } from '../pause/use-nixie-control';
import { usePauseState } from '../pause/use-pause-state';

export function PauseNixieButton(): ReactNode {
  const read = usePauseState();
  const pause = useNixieControl('pause');

  if (read.data === undefined || read.data.paused !== null) {
    return null;
  }

  return (
    <div>
      <button disabled={pause.isPending} onClick={pause.onSend} type="button">
        Pause nixie
      </button>
      {pause.isError ? <p role="alert">The pause did not finish. Try again.</p> : null}
    </div>
  );
}
