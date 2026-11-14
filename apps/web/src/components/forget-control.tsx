import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';

export interface ForgetControlProps {
  readonly thread: string;
  readonly sequence: number;
  readonly kind: string;

  readonly label: string;

  readonly hasText: boolean;
  readonly onForgotten: () => void;
  readonly onOpenChange: (isOpen: boolean) => void;
}

const control = css({ color: 'textMuted', display: 'block', fontSize: 'sm', marginTop: '1' });

export function ForgetControl(props: ForgetControlProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [actionID, setActionID] = useState<string | null>(null);

  const forget = useMutation(
    nixie.queryUtils.conversation.forget.mutationOptions({
      onSuccess: (_result, input) => {
        setActionID(null);

        props.onOpenChange(false);

        queryClient.removeQueries({
          queryKey: nixie.queryUtils.conversation.readImage.key({
            input: { thread: input.thread, sequence: input.sequence },
          }),
        });

        props.onForgotten();
      },
    }),
  );

  const noun = props.kind === 'owner_message' ? 'message' : 'reply';

  if (actionID === null && !props.hasText) {
    return null;
  }

  if (actionID === null) {
    return (
      <button
        className={control}
        onClick={() => {
          setActionID(crypto.randomUUID());

          props.onOpenChange(true);
        }}
        type="button"
      >
        {props.label}
      </button>
    );
  }

  return (
    <ForgetConfirmation
      canKeep={props.hasText}
      isError={forget.isError}
      isPending={forget.isPending}
      noun={noun}
      sequence={props.sequence}
      thread={props.thread}
      onConfirm={() => {
        forget.mutate({
          clientActionID: actionID,
          sequence: props.sequence,
          thread: props.thread,
        });
      }}
      onKeep={() => {
        setActionID(null);

        props.onOpenChange(false);
        forget.reset();
      }}
    />
  );
}

const confirmation = css({
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

interface ForgetConfirmationProps {
  readonly noun: string;
  readonly thread: string;
  readonly sequence: number;

  readonly canKeep: boolean;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly onConfirm: () => void;
  readonly onKeep: () => void;
}

const ownerSentence =
  "These memories stay, but lose their edit history, their quotes of this message, and any suggested changes you haven't answered.";

function ForgetConfirmation(props: ForgetConfirmationProps): ReactNode {
  const nixie = useNixieClient();

  // A forget that did not finish keeps this confirmation open, so the preview reads once per
  // confirmation and each new confirmation reads it again.
  const preview = useQuery({
    ...nixie.queryUtils.conversation.previewForget.queryOptions({
      input: { sequence: props.sequence, thread: props.thread },
    }),
    gcTime: 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (preview.isError) {
    return (
      <div aria-label={`Forget this ${props.noun}`} className={confirmation} role="group">
        <p role="alert">The forget could not read what it removes. Reload the page to try again.</p>
      </div>
    );
  }

  return (
    <div aria-label={`Forget this ${props.noun}`} className={confirmation} role="group">
      {preview.isPending ? <p>Reading what the forget removes…</p> : null}
      {preview.isSuccess ? <ForgetPreview preview={preview.data} /> : null}
      <span>Forget this {props.noun} for good? Its text goes from everywhere nixie keeps it.</span>
      {preview.isSuccess && preview.data.memoryItems.length > 0 ? <p>{ownerSentence}</p> : null}
      {preview.isSuccess ? (
        <button disabled={props.isPending} onClick={props.onConfirm} type="button">
          Forget for good
        </button>
      ) : null}
      {props.canKeep ? (
        <button disabled={props.isPending} onClick={props.onKeep} type="button">
          Keep
        </button>
      ) : null}
      {props.isError ? <p role="alert">The forget did not finish. Try again.</p> : null}
    </div>
  );
}

interface ForgetPreviewProps {
  readonly preview: {
    readonly momentCount: number;
    readonly memoryItems: readonly { readonly itemID: string; readonly text: string }[];
  };
}

const quotingItems = css({ listStyleType: 'disc', paddingInlineStart: '5' });

function ForgetPreview(props: ForgetPreviewProps): ReactNode {
  const moments = props.preview.momentCount === 1 ? 'moment' : 'moments';

  const items =
    props.preview.memoryItems.length === 1 ? 'memory item quotes' : 'memory items quote';

  return (
    <>
      <p>
        It is part of {props.preview.momentCount} {moments}. Each keeps its place and loses this
        text.
      </p>
      {props.preview.memoryItems.length === 0 ? (
        <p>No memory item quotes it.</p>
      ) : (
        <>
          <p>
            {props.preview.memoryItems.length} {items} it:
          </p>
          <ul aria-label="Memory items that quote it" className={quotingItems}>
            {props.preview.memoryItems.map((item) => (
              <li key={item.itemID}>{item.text}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
