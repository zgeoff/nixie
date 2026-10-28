import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatMemoryDate } from '../format-memory-date';
import { css } from '../styled-system/css';
import type { MomentDestroyPreview } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface MomentDestroyControlProps {
  readonly momentID: string;
  readonly version: number;

  readonly onDestroyed: () => void;
}

interface PendingDestroy {
  readonly actionID: string;
  readonly version: number;
}

export function MomentDestroyControl(props: MomentDestroyControlProps): ReactNode {
  const [pending, setPending] = useState<PendingDestroy | null>(null);

  if (pending === null) {
    return (
      <button
        onClick={() => {
          setPending({ actionID: crypto.randomUUID(), version: props.version });
        }}
        type="button"
      >
        Destroy this moment
      </button>
    );
  }

  return (
    <DestroyConfirmation
      {...props}
      onCancel={() => {
        setPending(null);
      }}
      pending={pending}
    />
  );
}

interface DestroyConfirmationProps extends MomentDestroyControlProps {
  readonly pending: PendingDestroy;

  readonly onCancel: () => void;
}

const confirmation = css({
  borderWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 'sm',
  gap: '2',
  marginBlock: '2',
  padding: '2',
});

function DestroyConfirmation(props: DestroyConfirmationProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const target = { momentID: props.momentID, version: props.pending.version };

  // The preview binds to the version it first read, so its key sits outside the memory queries that
  // every edit invalidates, and an edit leaves the preview it made stale in place.
  const preview = useQuery({
    ...nixie.queryUtils.memory.previewMomentDestroy.queryOptions({ input: target }),
    queryKey: ['moment-destroy-preview', props.pending.actionID],
    gcTime: 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const destroy = useMutation({
    mutationFn: () =>
      nixie.client.memory.destroyMoment({ ...target, clientActionID: props.pending.actionID }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });

      props.onDestroyed();
    },
  });

  const isStale =
    props.version !== props.pending.version || toErrorCode(destroy.error) === 'STALE_VERSION';

  return (
    <div aria-label="Destroy this moment" className={confirmation} role="group">
      {preview.isPending ? <p>Reading what the destroy shreds…</p> : null}
      {preview.isError ? <p role="alert">{pickPreviewNotice(preview.error)}</p> : null}
      {preview.isSuccess ? <DestroyPreview preview={preview.data} /> : null}
      {isStale ? (
        <p role="alert">
          This moment changed after the preview opened, so the preview is stale and nothing was
          destroyed. Close it, then open it again.
        </p>
      ) : null}
      {destroy.isError && !isStale ? (
        <p role="alert">The destroy did not finish. Try again.</p>
      ) : null}
      <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '2' })}>
        <button
          disabled={!preview.isSuccess || isStale || destroy.isPending}
          onClick={() => {
            destroy.mutate();
          }}
          type="button"
        >
          Destroy for good
        </button>
        <button disabled={destroy.isPending} onClick={props.onCancel} type="button">
          Keep it
        </button>
      </div>
    </div>
  );
}

function toErrorCode(error: unknown): string {
  return error instanceof ORPCError && typeof error.code === 'string' ? error.code : '';
}

const previewNotices: Readonly<Record<string, string>> = {
  MOMENT_NOT_FOUND: 'This moment is gone. It was destroyed after the page loaded.',
  STALE_VERSION: 'This moment changed after the page loaded. Close this, then try again.',
};

function pickPreviewNotice(error: unknown): string {
  return previewNotices[toErrorCode(error)] ?? 'The destroy could not read the moment. Try again.';
}

interface DestroyPreviewProps {
  readonly preview: MomentDestroyPreview;
}

const lossList = css({ listStyleType: 'disc', paddingInlineStart: '5' });

function DestroyPreview(props: DestroyPreviewProps): ReactNode {
  const preview = props.preview;
  const records = preview.kept.records === 1 ? 'record' : 'records';

  return (
    <>
      <p className={css({ fontWeight: 'bold' })}>
        Destroy this moment for good? You cannot undo it.
      </p>
      <p>The destroy shreds every version of these:</p>
      <ul aria-label="What the destroy shreds" className={lossList}>
        <li>The title: {preview.title ?? 'unreadable'}</li>
        {preview.note === null ? null : <li>Your note: {preview.note}</li>}
        {preview.reflections.map((reflection) => (
          <li key={`${reflection.model}/${reflection.writtenAt.toISOString()}`}>
            The reflection by {reflection.model}, {formatMemoryDate(reflection.writtenAt)}:{' '}
            {reflection.text ?? 'unreadable'}
          </li>
        ))}
        {preview.lost.links === 0 ? null : (
          <li>
            Its {preview.lost.links} {preview.lost.links === 1 ? 'link' : 'links'} from memory
          </li>
        )}
      </ul>
      <p>
        The {preview.kept.records} {records} of the conversation stay. Your messages and
        nixie&apos;s replies stay, and so do the messages and replies that quote this moment. Forget
        each one from the conversation.
      </p>
    </>
  );
}
