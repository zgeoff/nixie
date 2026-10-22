import { ORPCError } from '@orpc/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { match } from 'ts-pattern';
import { formatNoticeSummary } from '../format-notice-summary';
import type { NoticeEntryStatus } from '../pick-notice-entry-status';
import { pickNoticeEntryStatus } from '../pick-notice-entry-status';
import { css } from '../styled-system/css';
import type { MemoryNotice as MemoryNoticeData, MemoryNoticeEntry } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface MemoryNoticeProps {
  readonly notice: MemoryNoticeData;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });
const viewButton = css({ color: 'link', cursor: 'pointer', textDecoration: 'underline' });
const entries = css({ display: 'flex', flexDirection: 'column', gap: '2', marginTop: '2' });

export function MemoryNotice(props: MemoryNoticeProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const summary = formatNoticeSummary(props.notice);

  return (
    <li aria-label={summary} className={quiet}>
      <span>{summary}</span>
      {' · '}
      {props.notice.entries.length === 0 ? (
        <a className={viewButton} href="/memory">
          View
        </a>
      ) : (
        <ViewToggle
          isOpen={isOpen}
          onToggle={() => {
            setIsOpen(!isOpen);
          }}
        />
      )}
      {isOpen ? (
        <ul aria-label="Memory changes" className={entries}>
          {props.notice.entries.map((entry) => (
            <NoticeEntry entry={entry} key={`${entry.itemID}/${String(entry.sequence)}`} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

interface ViewToggleProps {
  readonly isOpen: boolean;

  readonly onToggle: () => void;
}

function ViewToggle(props: ViewToggleProps): ReactNode {
  return (
    <button
      aria-expanded={props.isOpen}
      className={viewButton}
      onClick={props.onToggle}
      type="button"
    >
      View
    </button>
  );
}

interface NoticeEntryProps {
  readonly entry: MemoryNoticeEntry;
}

const entryText = css({ color: 'text', whiteSpace: 'pre-wrap' });
const link = css({ color: 'link', textDecoration: 'underline' });

const statusLabels: Readonly<Record<Exclude<NoticeEntryStatus, 'open'>, string>> = {
  kept: 'Kept',
  undone: 'Undone',
  retired: 'Retired',
  changed: 'Changed since',
  proposed: 'Waiting for your review',
  gone: 'Forgotten',
};

function NoticeEntry(props: NoticeEntryProps): ReactNode {
  const [refusal, setRefusal] = useState<string | null>(null);
  const item = props.entry.item;
  const status = pickNoticeEntryStatus(props.entry);
  const label = item?.shortID ?? props.entry.itemID;

  return (
    <li aria-label={label}>
      {item !== null && item.status === 'readable' ? (
        <p className={entryText}>{item.text}</p>
      ) : null}
      {refusal === null ? null : <p role="alert">{refusal}</p>}
      {status === 'open' && item !== null ? (
        <EntryChanges entry={props.entry} onRefused={setRefusal} version={item.version} />
      ) : null}
      {status === 'open' ? null : (
        <p>
          <span>{statusLabels[status]}</span>
          {status === 'proposed' ? (
            <>
              {' · '}
              <a className={link} href="/memory/proposals">
                Review
              </a>
            </>
          ) : null}
        </p>
      )}
      {item === null || status === 'gone' ? null : (
        <a className={link} href={`/memory?item=${encodeURIComponent(item.itemID)}`}>
          Open in memory
        </a>
      )}
    </li>
  );
}

type EntryChange = 'undo' | 'keep' | 'retire';

const changeLabels = { undo: 'Undo', keep: 'Keep', retire: 'Retire' };

interface EntryChangesProps {
  readonly entry: MemoryNoticeEntry;
  readonly version: number;

  readonly onRefused: (refusal: string | null) => void;
}

const controls = css({ display: 'flex', flexWrap: 'wrap', gap: '2', marginTop: '1' });

function EntryChanges(props: EntryChangesProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const [actionIDs] = useState(() => ({
    undo: crypto.randomUUID(),
    keep: crypto.randomUUID(),
    retire: crypto.randomUUID(),
  }));

  const change = useMutation({
    mutationFn: (picked: EntryChange) =>
      sendChange(nixie.client, {
        change: picked,
        clientActionID: actionIDs[picked],
        itemID: props.entry.itemID,
        version: props.version,
      }),
    onError: (error) => {
      props.onRefused(getRefusalNotice(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() }),
  });

  const changes: readonly EntryChange[] =
    props.entry.change === 'retired' || props.entry.item?.state !== 'active'
      ? ['undo', 'keep']
      : ['undo', 'keep', 'retire'];

  return (
    <div className={controls}>
      {changes.map((picked) => (
        <button
          disabled={change.isPending}
          key={picked}
          onClick={() => {
            props.onRefused(null);
            change.mutate(picked);
          }}
          type="button"
        >
          {changeLabels[picked]}
        </button>
      ))}
    </div>
  );
}

type NixieClient = ReturnType<typeof useNixieClient>['client'];

interface ChangeInput {
  readonly change: EntryChange;
  readonly clientActionID: string;
  readonly itemID: string;
  readonly version: number;
}

async function sendChange(client: NixieClient, input: ChangeInput): Promise<void> {
  const target = {
    clientActionID: input.clientActionID,
    itemID: input.itemID,
    version: input.version,
  };

  await match(input.change)
    .with('undo', () => client.memory.undo(target))
    .with('keep', () => client.memory.keep(target))
    .with('retire', () => client.memory.retire(target))
    .exhaustive();
}

const refusalNotices: Readonly<Record<string, string>> = {
  MEMORY_ITEM_NOT_FOUND: 'Nothing changed: this item is gone.',
  PINNED_CORE_FULL: 'Nothing changed: the pinned core has no room for the text this brings back.',
  STALE_VERSION: 'Nothing changed: this item changed after the notice.',
  WRONG_STATE: 'Nothing changed: this item moved to another state after the notice.',
};

function getRefusalNotice(error: unknown): string {
  if (error instanceof ORPCError && typeof error.code === 'string') {
    return refusalNotices[error.code] ?? 'The change did not finish. Try again.';
  }

  return 'The change did not finish. Try again.';
}
