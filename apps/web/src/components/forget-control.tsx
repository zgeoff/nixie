import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';
import { useNixieClient } from '../use-nixie-client';

export interface ForgetControlProps {
  readonly record: LiveRecord;

  // whether the message still shows its text; a forget the stream reports as started drops it
  readonly hasText: boolean;
  readonly onForgotten: () => void;
}

// The control stays small and quiet below the text, so it never competes with the message.
const control = css({ color: 'textMuted', display: 'block', fontSize: 'sm', marginTop: '1' });

// The checked forget of one message or reply: the first press asks, and only the confirm forgets.
// Each confirmation keeps one client action ID, so a confirm that fails and goes again forgets once.
// A forget in flight or failed keeps its control after the text goes, so a failed cleanup can retry.
export function ForgetControl(props: ForgetControlProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [actionID, setActionID] = useState<string | null>(null);

  const forget = useMutation(
    nixie.queryUtils.conversation.forget.mutationOptions({
      onSuccess: (_result, input) => {
        setActionID(null);

        // a forgotten message's images are gone, so no page shows a copy this client kept
        queryClient.removeQueries({
          queryKey: nixie.queryUtils.conversation.readImage.key({
            input: { thread: input.thread, sequence: input.sequence },
          }),
        });

        props.onForgotten();
      },
    }),
  );

  const noun = props.record.kind === 'owner_message' ? 'message' : 'reply';

  if (actionID === null && !props.hasText) {
    return null;
  }

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
    <ForgetConfirmation
      canKeep={props.hasText}
      isError={forget.isError}
      isPending={forget.isPending}
      noun={noun}
      onConfirm={() => {
        forget.mutate({
          clientActionID: actionID,
          sequence: props.record.sequence,
          thread: props.record.thread,
        });
      }}
      onKeep={() => {
        setActionID(null);

        forget.reset();
      }}
    />
  );
}

interface ForgetConfirmationProps {
  readonly noun: string;

  // a forget whose start already dropped the text cannot be kept, only retried
  readonly canKeep: boolean;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly onConfirm: () => void;
  readonly onKeep: () => void;
}

const confirmation = css({
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

function ForgetConfirmation(props: ForgetConfirmationProps): ReactNode {
  return (
    <div aria-label={`Forget this ${props.noun}`} className={confirmation} role="group">
      <span>Forget this {props.noun} for good? Its text goes from everywhere nixie keeps it.</span>
      <button disabled={props.isPending} onClick={props.onConfirm} type="button">
        Forget for good
      </button>
      {props.canKeep ? (
        <button disabled={props.isPending} onClick={props.onKeep} type="button">
          Keep
        </button>
      ) : null}
      {props.isError ? <p role="alert">The forget did not finish. Try again.</p> : null}
    </div>
  );
}
