import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';
import { useNixieClient } from '../use-nixie-client';

export interface ForgetControlProps {
  readonly record: LiveRecord;
  readonly onForgotten: () => void;
}

// The checked forget of one message or reply: the first press asks, and only the confirm forgets.
// Each confirmation keeps one client action ID, so a confirm that fails and goes again forgets once.
export function ForgetControl(props: ForgetControlProps): ReactNode {
  const nixie = useNixieClient();
  const [actionID, setActionID] = useState<string | null>(null);

  const forget = useMutation(
    nixie.queryUtils.conversation.forget.mutationOptions({ onSuccess: props.onForgotten }),
  );

  const noun = props.record.kind === 'owner_message' ? 'message' : 'reply';

  if (actionID === null) {
    return (
      <button
        className={control}
        onClick={() => {
          setActionID(crypto.randomUUID());
        }}
        type="button"
      >
        Forget
      </button>
    );
  }

  return (
    <div aria-label={`Forget this ${noun}`} className={confirmation} role="group">
      <span>Forget this {noun} for good? Its text goes from everywhere nixie keeps it.</span>
      <button
        disabled={forget.isPending}
        onClick={() => {
          forget.mutate({
            clientActionID: actionID,
            sequence: props.record.sequence,
            thread: props.record.thread,
          });
        }}
        type="button"
      >
        Forget for good
      </button>
      <button
        disabled={forget.isPending}
        onClick={() => {
          setActionID(null);

          forget.reset();
        }}
        type="button"
      >
        Keep
      </button>
      {forget.isError ? <p role="alert">Not forgotten. Try again.</p> : null}
    </div>
  );
}

// The control stays small and quiet below the text, so it never competes with the message.
const control = css({ color: 'textMuted', display: 'block', fontSize: 'sm', marginTop: '1' });

const confirmation = css({
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});
