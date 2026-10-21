import { ORPCError } from '@orpc/client';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { ForgetPreview as ForgetPreviewData, MemoryItem } from '../types';
import { useMemoryForget } from '../use-memory-forget';
import { useNixieClient } from '../use-nixie-client';
import { MemoryVersionList } from './memory-version-list';

export interface MemoryForgetControlProps {
  readonly item: MemoryItem;

  readonly onSettled: (notice: string | null) => void;
}

interface PendingForget {
  readonly actionID: string;
  readonly version: number;
}

export function MemoryForgetControl(props: MemoryForgetControlProps): ReactNode {
  const [pending, setPending] = useState<PendingForget | null>(null);

  if (props.item.state === 'forgetting') {
    return <ForgetFinish {...props} />;
  }

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

function ForgetFinish(props: MemoryForgetControlProps): ReactNode {
  const forget = useMemoryForget(props.item.itemID, props.onSettled);
  const last = forget.last;

  if (last === null || (last.status !== 'failed' && last.status !== 'pending')) {
    return null;
  }

  return (
    <div aria-label="Finish the forget" className={css({ fontSize: 'sm' })} role="group">
      {last.status === 'failed' ? <p role="alert">The forget did not finish.</p> : null}
      <button
        disabled={last.status === 'pending'}
        onClick={() => {
          forget.send(last.input);
        }}
        type="button"
      >
        Finish the forget
      </button>
    </div>
  );
}

interface ForgetConfirmationProps {
  readonly itemID: string;
  readonly version: number;
  readonly actionID: string;

  readonly onCancel: () => void;

  readonly onSettled: (notice: string | null) => void;
}

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

function ForgetConfirmation(props: ForgetConfirmationProps): ReactNode {
  const nixie = useNixieClient();
  const target = { itemID: props.itemID, version: props.version };

  // The API refuses a preview once a forget began, and the retry of a failed forget needs the
  // confirm that the preview enables, so the preview reads once per confirmation.
  const preview = useQuery({
    ...nixie.queryUtils.memory.previewForget.queryOptions({ input: target }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <div aria-label="Forget this item" className={confirmation} role="group">
      {preview.isPending ? <p>Reading what the forget destroys…</p> : null}
      {preview.isError ? <p role="alert">{pickPreviewNotice(preview.error)}</p> : null}
      {preview.isSuccess ? <ForgetPreview preview={preview.data} /> : null}
      <ForgetButtons {...props} canForget={preview.isSuccess} />
    </div>
  );
}

const previewNotices: Readonly<Record<string, string>> = {
  MEMORY_ITEM_NOT_FOUND: 'This item is gone. It was forgotten after the list loaded.',
  STALE_VERSION: 'This item changed after the list loaded. Check it, then try again.',
};

function pickPreviewNotice(error: unknown): string {
  const code = error instanceof ORPCError && typeof error.code === 'string' ? error.code : '';

  return previewNotices[code] ?? 'The forget could not read the item. Try again.';
}

interface ForgetPreviewProps {
  readonly preview: ForgetPreviewData;
}

const lossList = css({ listStyleType: 'disc', paddingInlineStart: '5' });

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
  readonly canForget: boolean;
}

function ForgetButtons(props: ForgetButtonsProps): ReactNode {
  const forget = useMemoryForget(props.itemID, props.onSettled);
  const isPending = forget.own?.status === 'pending';

  return (
    <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '2' })}>
      <button
        disabled={!props.canForget || isPending}
        onClick={() => {
          forget.send({
            clientActionID: props.actionID,
            itemID: props.itemID,
            version: props.version,
          });
        }}
        type="button"
      >
        Forget for good
      </button>
      <button disabled={isPending} onClick={props.onCancel} type="button">
        Keep it
      </button>
      {forget.own?.status === 'failed' ? (
        <p role="alert">The forget did not finish. Try again.</p>
      ) : null}
    </div>
  );
}
