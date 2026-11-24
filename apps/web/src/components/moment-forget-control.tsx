import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatMemoryDate } from '../memory/format-memory-date';
import { css } from '../styled-system/css';
import type { ForgetBackup, MomentDestroyPreview } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';
import { ForgetBackupLine } from './forget-backup-line';

export interface MomentForgetControlProps {
  readonly momentID: string;
  readonly version: number;

  readonly onForgotten: () => void;
}

interface PendingForget {
  readonly actionID: string;
  readonly version: number;
}

export function MomentForgetControl(props: MomentForgetControlProps): ReactNode {
  const [pending, setPending] = useState<PendingForget | null>(null);

  if (pending === null) {
    return (
      <button
        onClick={() => {
          setPending({ actionID: crypto.randomUUID(), version: props.version });
        }}
        type="button"
      >
        Forget this moment
      </button>
    );
  }

  return (
    <ForgetConfirmation
      {...props}
      onCancel={() => {
        setPending(null);
      }}
      pending={pending}
    />
  );
}

interface ForgetConfirmationProps extends MomentForgetControlProps {
  readonly pending: PendingForget;

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

function ForgetConfirmation(props: ForgetConfirmationProps): ReactNode {
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

  const forget = useMutation({
    mutationFn: () =>
      nixie.client.memory.destroyMoment({ ...target, clientActionID: props.pending.actionID }),
  });

  if (forget.isSuccess) {
    return (
      <MomentForgotten
        backup={forget.data.backup}
        onLeave={async () => {
          await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });

          props.onForgotten();
        }}
      />
    );
  }

  const isStale =
    props.version !== props.pending.version || toErrorCode(forget.error) === 'STALE_VERSION';

  return (
    <div aria-label="Forget this moment" className={confirmation} role="group">
      {preview.isPending ? <p>Reading what the forget removes…</p> : null}
      {preview.isError ? <p role="alert">{pickPreviewNotice(preview.error)}</p> : null}
      {preview.isSuccess ? <ForgetPreview preview={preview.data} /> : null}
      {isStale ? (
        <p role="alert">
          This moment changed after the preview opened, so the preview is stale and nothing was
          forgotten. Close it, then open it again.
        </p>
      ) : null}
      {forget.isError && !isStale ? (
        <p role="alert">The forget did not finish. Try again.</p>
      ) : null}
      <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '2' })}>
        <button
          disabled={!preview.isSuccess || isStale || forget.isPending}
          onClick={() => {
            forget.mutate();
          }}
          type="button"
        >
          Forget for good
        </button>
        <button disabled={forget.isPending} onClick={props.onCancel} type="button">
          Keep it
        </button>
      </div>
    </div>
  );
}

interface MomentForgottenProps {
  readonly backup: ForgetBackup | undefined;
  readonly onLeave: () => Promise<void>;
}

// The moment's view stays on screen until the user leaves, so the backup state that the forget
// reported is not lost with the moment it came from.
function MomentForgotten(props: MomentForgottenProps): ReactNode {
  return (
    <div aria-label="This moment is forgotten" className={confirmation} role="group">
      <p>The moment is forgotten.</p>
      {props.backup === undefined ? null : <ForgetBackupLine backup={props.backup} />}
      <button
        onClick={() => {
          void props.onLeave();
        }}
        type="button"
      >
        Back to the moments
      </button>
    </div>
  );
}

function toErrorCode(error: unknown): string {
  return error instanceof ORPCError && typeof error.code === 'string' ? error.code : '';
}

const previewNotices: Readonly<Record<string, string>> = {
  MOMENT_NOT_FOUND: 'This moment is gone. It was forgotten after the page loaded.',
  STALE_VERSION: 'This moment changed after the page loaded. Close this, then try again.',
};

function pickPreviewNotice(error: unknown): string {
  return previewNotices[toErrorCode(error)] ?? 'The forget could not read the moment. Try again.';
}

interface ForgetPreviewProps {
  readonly preview: MomentDestroyPreview;
}

const lossList = css({ listStyleType: 'disc', paddingInlineStart: '5' });

function ForgetPreview(props: ForgetPreviewProps): ReactNode {
  const preview = props.preview;
  const records = preview.kept.records === 1 ? 'record' : 'records';

  return (
    <>
      <p className={css({ fontWeight: 'bold' })}>
        Forget this moment for good? You cannot undo it.
      </p>
      <p>The forget removes every version of these:</p>
      <ul aria-label="What the forget removes" className={lossList}>
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
