import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { ForgetBackup } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';

export interface NoteForgetControlProps {
  readonly note: string;

  // true for a private note that the page shows no title for: the preview then names neither its
  // title nor its link counts
  readonly isHidden: boolean;

  // the note's current version as the page loaded it, or undefined when the page showed none: a
  // preview of a later version asks the user to reload
  readonly version: number | undefined;

  // the version whose body the page shows, which an older one from the history differs from
  readonly shownVersion: number | undefined;
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

// A forget always takes the whole note, private ones too, so the preview and the request both name
// the note's current version, whatever version the page shows. A note that changed since the page
// loaded, or since the preview, asks the user to reload.
export function NoteForgetControl(props: NoteForgetControlProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [actionID, setActionID] = useState<string | null>(null);
  const onForgotten = props.onForgotten;

  const previewOptions = nixie.queryUtils.notebook.previewForget.queryOptions({
    input: { note: props.note },
  });

  const preview = useQuery({
    ...previewOptions,
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

  const isBehind =
    preview.isSuccess && props.version !== undefined && preview.data.version !== props.version;

  const isOlderShown =
    props.shownVersion !== undefined &&
    props.version !== undefined &&
    props.shownVersion !== props.version;

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
      {preview.isSuccess && props.isHidden ? (
        <p>Forget this private note for good? It goes with all its versions and links.</p>
      ) : null}
      {preview.isSuccess && !props.isHidden && isBehind ? (
        <p role="alert">
          The note changed since this page loaded. Reload the page, then forget it.
        </p>
      ) : null}
      {preview.isSuccess && !props.isHidden && !isBehind ? (
        <p>
          Forget &quot;{preview.data.title}&quot; for good? It goes with its{' '}
          {preview.data.versionCount} {preview.data.versionCount === 1 ? 'version' : 'versions'} and
          its {preview.data.linkCount} {preview.data.linkCount === 1 ? 'link' : 'links'}. The{' '}
          {preview.data.backlinkCount} {preview.data.backlinkCount === 1 ? 'link' : 'links'} from
          other notes stay and read as gone.
        </p>
      ) : null}
      {preview.isSuccess && !props.isHidden && !isBehind && isOlderShown ? (
        <p>
          This page shows version {props.shownVersion}. The forget removes the note with every
          version, up to version {props.version}.
        </p>
      ) : null}
      {preview.isSuccess && !isBehind ? (
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

          // The next preview reads the note again: a note edited meanwhile has a new version.
          queryClient.removeQueries({ queryKey: previewOptions.queryKey });
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
