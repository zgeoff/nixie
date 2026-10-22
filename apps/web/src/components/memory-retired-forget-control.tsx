import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { ForgetStatus, RetiredForgetItem } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface MemoryRetiredForgetControlProps {
  readonly onSettled: (notice: string) => void;
}

export function MemoryRetiredForgetControl(props: MemoryRetiredForgetControlProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
        }}
        type="button"
      >
        Delete retired items
      </button>
    );
  }

  return (
    <RetiredForgetConfirmation
      onClose={(notice) => {
        setIsOpen(false);

        if (notice !== null) {
          props.onSettled(notice);
        }
      }}
    />
  );
}

interface RetiredForgetConfirmationProps {
  readonly onClose: (notice: string | null) => void;
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

function RetiredForgetConfirmation(props: RetiredForgetConfirmationProps): ReactNode {
  const nixie = useNixieClient();

  // A closed confirmation drops its preview, so the next one reads the retired items again.
  const preview = useQuery({
    ...nixie.queryUtils.memory.previewForgetRetired.queryOptions(),
    gcTime: 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <div aria-label="Delete retired items" className={confirmation} role="group">
      {preview.isPending ? <p>Reading the retired items…</p> : null}
      {preview.data === undefined && preview.isError ? (
        <p role="alert">The retired items did not load. Try again.</p>
      ) : null}
      {preview.data === undefined ? (
        <button
          onClick={() => {
            props.onClose(null);
          }}
          type="button"
        >
          Keep them
        </button>
      ) : (
        <RetiredForgetForm
          hasMore={preview.data.hasMore}
          items={preview.data.items}
          onClose={props.onClose}
        />
      )}
    </div>
  );
}

interface RetiredForgetFormProps {
  readonly items: readonly RetiredForgetItem[];
  readonly hasMore: boolean;
  readonly onClose: (notice: string | null) => void;
}

interface SentForget {
  readonly clientActionID: string;
  readonly targets: readonly { readonly itemID: string; readonly version: number }[];
}

const itemList = css({ display: 'flex', flexDirection: 'column', gap: '1' });

function RetiredForgetForm(props: RetiredForgetFormProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  // The confirmation binds to the set the preview first showed, and a refetch after a failed run
  // must not swap that set for the items still retired.
  const [items] = useState(props.items);

  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(items.map((item) => item.itemID)),
  );

  const [sent, setSent] = useState<SentForget | null>(null);

  const forget = useMutation({
    mutationFn: (input: SentForget) =>
      nixie.client.memory.forgetRetired({ ...input, targets: [...input.targets] }),
    onSettled: async (status, error) => {
      const notice = status === undefined ? findRefusalNotice(error) : formatDeleted(status);

      if (notice !== null) {
        props.onClose(notice);
      }

      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });
    },
  });

  if (items.length === 0) {
    return (
      <>
        <p>No retired item to delete.</p>
        <button
          onClick={() => {
            props.onClose(null);
          }}
          type="button"
        >
          Close
        </button>
      </>
    );
  }

  const isPending = forget.isPending;
  const hasFailed = forget.isError && findRefusalNotice(forget.error) === null;
  const isLocked = sent !== null;

  return (
    <>
      <p className={css({ fontWeight: 'bold' })}>
        Delete these retired items for good? You cannot undo it.
      </p>
      <p>
        Each item loses the text of every version, its place in recall, and the conversation
        summaries and sessions that hold it. Your messages and nixie&apos;s replies stay.
      </p>
      {props.hasMore ? (
        <p>
          This list shows the oldest 100 retired items. Delete these, then open it again for the
          rest.
        </p>
      ) : null}
      <ul aria-label="Retired items to delete" className={itemList}>
        {items.map((item) => (
          <li key={item.itemID}>
            <label>
              <input
                checked={selected.has(item.itemID)}
                disabled={isLocked}
                onChange={(event) => {
                  setSelected(toggleItem(selected, item.itemID, event.target.checked));
                }}
                type="checkbox"
              />{' '}
              {item.shortID}: {item.text ?? 'Text unreadable'} (version {item.version})
            </label>
          </li>
        ))}
      </ul>
      {hasFailed && sent !== null ? <ForgetProgress itemIDs={sent.targets} /> : null}
      <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '2' })}>
        {isLocked ? null : (
          <>
            <button
              onClick={() => {
                setSelected(new Set(items.map((item) => item.itemID)));
              }}
              type="button"
            >
              Select all
            </button>
            <button
              onClick={() => {
                setSelected(new Set());
              }}
              type="button"
            >
              Select none
            </button>
          </>
        )}
        <button
          disabled={selected.size === 0 || isPending}
          onClick={() => {
            const input = sent ?? {
              clientActionID: crypto.randomUUID(),
              targets: items
                .filter((item) => selected.has(item.itemID))
                .map((item) => ({ itemID: item.itemID, version: item.version })),
            };

            setSent(input);

            forget.mutate(input);
          }}
          type="button"
        >
          {isLocked ? 'Finish the deletion' : `Delete ${formatCount(selected.size)} for good`}
        </button>
        {isLocked ? null : (
          <button
            onClick={() => {
              props.onClose(null);
            }}
            type="button"
          >
            Keep them
          </button>
        )}
      </div>
    </>
  );
}

const refusalNotices: Readonly<Record<string, string>> = {
  MEMORY_ITEM_NOT_FOUND:
    'An item in the list is gone, so nothing was deleted. Check the retired items, then try again.',
  STALE_VERSION:
    'An item changed after the list loaded, so nothing was deleted. Check the retired items, then try again.',
  WRONG_STATE:
    'An item is no longer retired, so nothing was deleted. Check the retired items, then try again.',
};

function findRefusalNotice(error: unknown): string | null {
  if (error instanceof ORPCError && typeof error.code === 'string') {
    return refusalNotices[error.code] ?? null;
  }

  return null;
}

function formatDeleted(status: ForgetStatus): string {
  return `Deleted ${formatCount(status.deleted.length)} for good.`;
}

function formatCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'item' : 'items'}`;
}

function toggleItem(
  selected: ReadonlySet<string>,
  itemID: string,
  isChecked: boolean,
): ReadonlySet<string> {
  const next = new Set(selected);

  if (isChecked) {
    next.add(itemID);
  } else {
    next.delete(itemID);
  }

  return next;
}

interface ForgetProgressProps {
  readonly itemIDs: SentForget['targets'];
}

function ForgetProgress(props: ForgetProgressProps): ReactNode {
  const nixie = useNixieClient();

  const status = useQuery(
    nixie.queryUtils.memory.readForgetStatus.queryOptions({
      input: { itemIDs: props.itemIDs.map((target) => target.itemID) },
    }),
  );

  return (
    <div role="alert">
      <p>The deletion did not finish. Finish it to delete the rest.</p>
      {status.data === undefined ? null : (
        <p>
          {formatCount(status.data.deleted.length)} deleted,{' '}
          {formatCount(status.data.pending.length)} still pending.
        </p>
      )}
    </div>
  );
}
