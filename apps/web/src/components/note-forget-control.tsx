import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { ForgetBackup } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';

export interface NoteForgetControlProps {
  readonly note: string;
  readonly onForgotten: (backup: ForgetBackup) => void;
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

// The forget of a whole note, private ones too, with no open of the note. The preview says what
// goes, and the forget binds to the version the preview read, so a note that changed since asks
// the user to reload.
export function NoteForgetControl(props: NoteForgetControlProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [actionID, setActionID] = useState<string | null>(null);
  const onForgotten = props.onForgotten;

  const preview = useQuery({
    ...nixie.queryUtils.notebook.previewForget.queryOptions({ input: { note: props.note } }),
    enabled: actionID !== null,
    gcTime: 0,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const forget = useMutation(
    nixie.queryUtils.notebook.forget.mutationOptions({
      onSuccess: (result) => {
        setActionID(null);
        onForgotten(result.backup);

        // Every cached list, note and preview can hold the title or the body, the view that is not
        // on screen too.
        queryClient.removeQueries({ queryKey: nixie.queryUtils.notebook.key() });
      },
    }),
  );

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
    <div aria-label="Forget this note" className={confirmation} role="group">
      {preview.isPending ? <p>Reading what the forget removes…</p> : null}
      {preview.isError ? (
        <p role="alert">The forget could not read what it removes. Reload the page to try again.</p>
      ) : null}
      {preview.isSuccess ? (
        <p>
          Forget &quot;{preview.data.title}&quot; for good? It goes with its{' '}
          {preview.data.versionCount} {preview.data.versionCount === 1 ? 'version' : 'versions'} and
          its {preview.data.linkCount} {preview.data.linkCount === 1 ? 'link' : 'links'}. The{' '}
          {preview.data.backlinkCount} {preview.data.backlinkCount === 1 ? 'link' : 'links'} from
          other notes stay and read as gone.
        </p>
      ) : null}
      {preview.isSuccess ? (
        <button
          disabled={forget.isPending}
          onClick={() => {
            forget.mutate({
              clientActionID: actionID,
              note: props.note,
              version: preview.data.version,
            });
          }}
          type="button"
        >
          Forget for good
        </button>
      ) : null}
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
      {forget.isError ? (
        <p role="alert">
          {isStaleError(forget.error)
            ? 'The note changed since this preview. Reload the page, then forget it again.'
            : 'The forget did not finish. Try again.'}
        </p>
      ) : null}
    </div>
  );
}

function isStaleError(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'STALE_VERSION';
}
