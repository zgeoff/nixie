import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatItemCount } from '../format-item-count';
import { css } from '../styled-system/css';
import type { RetiredForgetItem } from '../types';
import { useNixieClient } from '../use-nixie-client';
import type { RetiredForgetInput } from '../use-retired-forget';
import { useRetiredForget } from '../use-retired-forget';

export interface MemoryRetiredForgetControlProps {
  readonly onSettled: (notice: string) => void;
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

export function MemoryRetiredForgetControl(props: MemoryRetiredForgetControlProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const forget = useRetiredForget(props.onSettled);

  if (isOpen) {
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

  // The query client keeps every bulk call apart from this control, so a run whose cleanup failed
  // still offers its finish after the page is left and opened again.
  if (forget.unfinished !== null) {
    const input = forget.unfinished;

    return (
      <div aria-label="Finish the deletion" className={confirmation} role="group">
        <ForgetProgress targets={input.targets} />
        <button
          disabled={forget.isPending}
          onClick={() => {
            forget.send(input);
          }}
          type="button"
        >
          Finish the deletion
        </button>
      </div>
    );
  }

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

interface RetiredForgetConfirmationProps {
  readonly onClose: (notice: string | null) => void;
}

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

const itemList = css({ display: 'flex', flexDirection: 'column', gap: '1' });

function RetiredForgetForm(props: RetiredForgetFormProps): ReactNode {
  // The confirmation binds to the set the preview first showed, and a refetch after a failed run
  // must not swap that set for the items still retired.
  const [items] = useState(props.items);

  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(items.map((item) => item.itemID)),
  );

  const [sent, setSent] = useState<RetiredForgetInput | null>(null);
  const forget = useRetiredForget(props.onClose);

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
      {forget.hasFailed && sent !== null ? <ForgetProgress targets={sent.targets} /> : null}
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
          disabled={selected.size === 0 || forget.isPending}
          onClick={() => {
            const input = sent ?? {
              clientActionID: crypto.randomUUID(),
              targets: items
                .filter((item) => selected.has(item.itemID))
                .map((item) => ({ itemID: item.itemID, version: item.version })),
            };

            setSent(input);

            forget.send(input);
          }}
          type="button"
        >
          {isLocked ? 'Finish the deletion' : `Delete ${formatItemCount(selected.size)} for good`}
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
  readonly targets: RetiredForgetInput['targets'];
}

function ForgetProgress(props: ForgetProgressProps): ReactNode {
  const nixie = useNixieClient();

  const status = useQuery(
    nixie.queryUtils.memory.readForgetStatus.queryOptions({
      input: { itemIDs: props.targets.map((target) => target.itemID) },
    }),
  );

  return (
    <div role="alert">
      <p>The deletion did not finish. Finish it to delete the rest.</p>
      {status.data === undefined ? null : (
        <p>
          {formatItemCount(status.data.deleted.length)} deleted,{' '}
          {formatItemCount(status.data.pending.length)} still pending.
        </p>
      )}
    </div>
  );
}
