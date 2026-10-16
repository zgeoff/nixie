import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { ForgetPreview as ForgetPreviewData, MemoryItem } from '../types';
import { useNixieClient } from '../use-nixie-client';
import { MemoryVersionList } from './memory-version-list';

export interface MemoryForgetControlProps {
  readonly item: MemoryItem;

  // tells the view how a confirmed forget ended: what to tell the user when it was refused, or
  // null when it applied
  readonly onSettled: (notice: string | null) => void;
}

// a confirmation keeps the version it asked about, so a list that refreshes under it never moves
// the forget onto a version the user did not see
interface PendingForget {
  readonly actionID: string;
  readonly version: number;
}

// The forget of one active or retired item for good. The first press opens a confirmation bound to
// the version the row shows, which reads what the forget destroys; only its confirm forgets, and it
// keeps one client action ID, so a confirm that fails and goes again forgets once.
export function MemoryForgetControl(props: MemoryForgetControlProps): ReactNode {
  const [pending, setPending] = useState<PendingForget | null>(null);

  if (props.item.state !== 'active' && props.item.state !== 'retired') {
    return null;
  }

  if (pending === null) {
    return (
      <button
        onClick={() => {
          setPending({ actionID: crypto.randomUUID(), version: props.item.version });
        }}
        type="button"
      >
        Forget
      </button>
    );
  }

  return (
    <ForgetConfirmation
      actionID={pending.actionID}
      itemID={props.item.itemID}
      onCancel={() => {
        setPending(null);
      }}
      onSettled={(notice) => {
        setPending(null);

        props.onSettled(notice);
      }}
      version={pending.version}
    />
  );
}

interface ForgetConfirmationProps {
  readonly itemID: string;
  readonly version: number;
  readonly actionID: string;

  readonly onCancel: () => void;

  // closes the confirmation once the forget applied or was refused, with the refusal's reason
  readonly onSettled: (notice: string | null) => void;
}

function ForgetConfirmation(props: ForgetConfirmationProps): ReactNode {
  const nixie = useNixieClient();
  const target = { itemID: props.itemID, version: props.version };

  // A refusal is the answer, so a preview of an item that moved on never retries. The preview reads
  // once per confirmation, because a read after a forget began refuses, and the retry of a failed
  // forget needs the confirm the preview enables.
  const preview = useQuery({
    ...nixie.queryUtils.memory.previewForget.queryOptions({ input: target }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <div aria-label="Forget this item" className={confirmation} role="group">
      {preview.isPending ? <p>Reading what the forget destroys…</p> : null}
      {preview.isError ? <p role="alert">{findPreviewNotice(preview.error)}</p> : null}
      {preview.isSuccess ? <ForgetPreview preview={preview.data} /> : null}
      <ForgetButtons {...props} canForget={preview.isSuccess} />
    </div>
  );
}

// the confirmation takes the whole width of the row of controls it opens in
const confirmation = css({
  borderWidth: '1px',
  flexBasis: 'full',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
  padding: '2',
});

const previewNotices: Readonly<Record<string, string>> = {
  MEMORY_ITEM_NOT_FOUND: 'This item is gone. It was forgotten after the list loaded.',
  STALE_VERSION: 'This item changed after the list loaded. Check it, then try again.',
};

function findPreviewNotice(error: unknown): string {
  const code = error instanceof ORPCError && typeof error.code === 'string' ? error.code : '';

  return previewNotices[code] ?? 'The forget could not read the item. Try again.';
}

interface ForgetPreviewProps {
  readonly preview: ForgetPreviewData;
}

// The item with every version, what the forget destroys, and what it cannot reach: the disk
// snapshots you took by hand, and your messages and nixie's replies that state the same fact.
function ForgetPreview(props: ForgetPreviewProps): ReactNode {
  return (
    <>
      <p className={css({ fontWeight: 'bold' })}>Forget this item for good? You cannot undo it.</p>
      <MemoryVersionList versions={props.preview.versions} />
      <p>The forget destroys:</p>
      <ul aria-label="What the forget destroys" className={lossList}>
        {buildLosses(props.preview.lost).map((loss) => (
          <li key={loss}>{loss}</li>
        ))}
      </ul>
      <p>
        A disk snapshot that you took by hand of nixie&apos;s host or its volumes still holds this
        item. nixie cannot reach it, so delete it yourself.
      </p>
      <p>
        Your messages and nixie&apos;s replies that state the same fact stay. Forget each one from{' '}
        <a className={css({ color: 'link', textDecoration: 'underline' })} href="/">
          the conversation
        </a>
        .
      </p>
    </>
  );
}

const lossList = css({ listStyleType: 'disc', paddingInlineStart: '5' });

// each thing the forget destroys, the counted ones only when there is one
function buildLosses(lost: ForgetPreviewData['lost']): readonly string[] {
  const messages = lost.evidenceMessages === 1 ? 'message' : 'messages';
  const proposals = lost.proposals === 1 ? 'proposal' : 'proposals';

  return [
    'The text of every version',
    'Its place in recall and in the pinned core',
    'The conversation summaries that hold it',
    "The conversation's session, which nixie rebuilds without it",
    ...(lost.evidenceMessages === 0
      ? []
      : [`Recall of the ${String(lost.evidenceMessages)} ${messages} it came from`]),
    ...(lost.proposals === 0 ? [] : [`The text of its ${String(lost.proposals)} ${proposals}`]),
  ];
}

interface ForgetButtonsProps extends ForgetConfirmationProps {
  // whether the preview read the item, which the confirm needs
  readonly canForget: boolean;
}

function ForgetButtons(props: ForgetButtonsProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const forget = useMutation({
    mutationFn: () =>
      nixie.client.memory.forget({
        clientActionID: props.actionID,
        itemID: props.itemID,
        version: props.version,
      }),

    // A refusal reads the lists again. Any other failure keeps them as they are, because a refresh
    // would move an item whose forget began out of this row, and the retry needs this action ID.
    onError: async (error) => {
      const notice = findForgetNotice(error);

      if (notice !== null) {
        props.onSettled(notice);

        await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });
      }
    },
    onSuccess: async () => {
      props.onSettled(null);

      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });
    },
  });

  return (
    <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '2' })}>
      <button
        disabled={!props.canForget || forget.isPending}
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
      {forget.isError ? <p role="alert">The forget did not finish. Try again.</p> : null}
    </div>
  );
}

const forgetNotices: Readonly<Record<string, string>> = {
  MEMORY_ITEM_NOT_FOUND: 'This item is gone. It was forgotten after the list loaded.',
  STALE_VERSION:
    'This item changed after you opened it, so nothing was forgotten. Check it, then try again.',
};

// a refusal closes the confirmation with its reason; any other failure keeps it open to retry
function findForgetNotice(error: unknown): string | null {
  if (error instanceof ORPCError && typeof error.code === 'string') {
    return forgetNotices[error.code] ?? null;
  }

  return null;
}
