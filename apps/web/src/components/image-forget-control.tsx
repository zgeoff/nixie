import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { ForgetBackup } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';
import { ForgetBackupLine } from './forget-backup-line';

export interface ImageForgetControlProps {
  readonly image: string;
  readonly onForgotten: (image: string) => void;
}

const control = css({ color: 'textMuted', display: 'block', fontSize: 'sm', marginTop: '1' });

const confirmation = css({
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

// The forget of a whole image: its picture, its prompt, its name and the assistant's request for it.
// The control asks first, and after the forget it shows the key backup state in its place.
export function ImageForgetControl(props: ImageForgetControlProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [actionID, setActionID] = useState<string | null>(null);
  const [backup, setBackup] = useState<ForgetBackup | null>(null);

  const forget = useMutation(
    nixie.queryUtils.images.forget.mutationOptions({
      onSuccess: (result, input) => {
        setActionID(null);
        setBackup(result.backup);

        queryClient.removeQueries({ queryKey: nixie.queryUtils.images.readBytes.key() });

        // Every cached list and read can hold the name and prompt, so each one starts again,
        // the view that is not on screen too.
        void queryClient.resetQueries({ queryKey: nixie.queryUtils.images.list.key() });
        void queryClient.resetQueries({ queryKey: nixie.queryUtils.images.read.key() });
        props.onForgotten(input.image);
      },
    }),
  );

  if (backup !== null) {
    return <ForgetBackupLine backup={backup} />;
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
    <div aria-label="Forget this image" className={confirmation} role="group">
      <span>
        Forget this picture? It leaves the images page and the assistant&apos;s image tools. A photo
        or file you sent stays in the conversation.
      </span>
      <button
        disabled={forget.isPending}
        onClick={() => {
          forget.mutate({ clientActionID: actionID, image: props.image });
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
      {forget.isError ? <p role="alert">The forget did not finish. Try again.</p> : null}
    </div>
  );
}
