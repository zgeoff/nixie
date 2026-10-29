import { ORPCError } from '@orpc/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { match } from 'ts-pattern';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { useNixieClient } from '../use-nixie-client';
import { MemoryForgetControl } from './memory-forget-control';

export interface MemoryItemActionsProps {
  readonly item: MemoryItem;

  readonly onSettled: (notice: string | null) => void;
}

type MemoryChange = 'retire' | 'restore' | 'pin' | 'unpin' | 'mark' | 'unmark';

interface PendingChange {
  readonly change: MemoryChange;
  readonly actionID: string;
  readonly version: number;
}

const labels = {
  pin: 'Pin',
  restore: 'Restore',
  retire: 'Retire',
  unpin: 'Unpin',
  mark: 'Mark sensitive',
  unmark: 'Clear sensitive',
};

const controls = css({
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

export function MemoryItemActions(props: MemoryItemActionsProps): ReactNode {
  const [pending, setPending] = useState<PendingChange | null>(null);
  const changes = pickChanges(props.item);

  if (pending === null && changes.length === 0) {
    return <MemoryForgetControl item={props.item} onSettled={props.onSettled} />;
  }

  if (pending === null) {
    return (
      <div className={controls}>
        {changes.map((change) => (
          <button
            key={change}
            onClick={() => {
              setPending({ actionID: crypto.randomUUID(), change, version: props.item.version });
            }}
            type="button"
          >
            {labels[change]}
          </button>
        ))}
        <MemoryForgetControl item={props.item} onSettled={props.onSettled} />
      </div>
    );
  }

  return (
    <ChangeConfirmation
      actionID={pending.actionID}
      change={pending.change}
      itemID={props.item.itemID}
      version={pending.version}
      onCancel={() => {
        setPending(null);
      }}
      onSettled={(notice) => {
        setPending(null);

        props.onSettled(notice);
      }}
    />
  );
}

function pickChanges(item: MemoryItem): readonly MemoryChange[] {
  if (item.state === 'forgetting' || item.state === 'forgotten') {
    return [];
  }

  const sensitive = item.isSensitive ? 'unmark' : 'mark';

  if (item.state === 'retired') {
    return item.isPinned ? ['restore', 'unpin', sensitive] : ['restore', sensitive];
  }

  if (item.isPinned) {
    return ['retire', 'unpin', sensitive];
  }

  return ['retire', 'pin', sensitive];
}

const questions = {
  pin: 'Pin this item? Every session opens with it.',
  restore: 'Restore this item? Recalls find it again.',
  retire: 'Retire this item? Recalls stop finding it, and you can restore it.',
  unpin: 'Unpin this item? Sessions stop opening with it.',
  mark: 'Mark this item sensitive? Turns stop bringing it up, and nixie finds it only when a request needs it.',
  unmark: 'Clear the sensitive mark? Turns bring this item up again when a message matches it.',
};

interface ChangeConfirmationProps {
  readonly itemID: string;
  readonly version: number;
  readonly change: MemoryChange;
  readonly actionID: string;

  readonly onCancel: () => void;

  readonly onSettled: (notice: string | null) => void;
}

const groupLabels = {
  pin: 'Pin this item',
  restore: 'Restore this item',
  retire: 'Retire this item',
  unpin: 'Unpin this item',
  mark: 'Mark this item sensitive',
  unmark: 'Clear the sensitive mark',
};

const confirmation = css({
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

function ChangeConfirmation(props: ChangeConfirmationProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const change = useMutation({
    mutationFn: () => sendChange(nixie.client, props),
    onError: (error) => {
      const notice = findRefusalNotice(error);

      if (notice !== null) {
        props.onSettled(notice);
      }
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() }),
    onSuccess: () => {
      props.onSettled(null);
    },
  });

  return (
    <div aria-label={groupLabels[props.change]} className={confirmation} role="group">
      <span>{questions[props.change]}</span>
      <button
        disabled={change.isPending}
        onClick={() => {
          change.mutate();
        }}
        type="button"
      >
        {labels[props.change]}
      </button>
      <button disabled={change.isPending} onClick={props.onCancel} type="button">
        Keep as it is
      </button>
      {change.isError ? <p role="alert">The change did not finish. Try again.</p> : null}
    </div>
  );
}

type NixieClient = ReturnType<typeof useNixieClient>['client'];

async function sendChange(client: NixieClient, props: ChangeConfirmationProps): Promise<void> {
  const input = {
    clientActionID: props.actionID,
    itemID: props.itemID,
    version: props.version,
  };

  await match(props.change)
    .with('retire', () => client.memory.retire(input))
    .with('restore', () => client.memory.restore(input))
    .with('pin', 'unpin', (change) => client.memory.pin({ ...input, isPinned: change === 'pin' }))
    .with('mark', 'unmark', (change) =>
      client.memory.markSensitive({
        clientActionID: props.actionID,
        itemID: props.itemID,
        isSensitive: change === 'mark',
      }),
    )
    .exhaustive();
}

const refusalNotices: Readonly<Record<string, string>> = {
  MEMORY_ITEM_NOT_FOUND: 'This item is gone. It was forgotten after the list loaded.',
  PINNED_CORE_FULL: 'The pinned core has no room for this item. Unpin another item first.',
  STALE_VERSION:
    'This item changed after you opened it, so nothing changed. Check it, then try again.',
  WRONG_STATE: 'This item moved to another state after you opened it, so nothing changed.',
};

function findRefusalNotice(error: unknown): string | null {
  if (error instanceof ORPCError && typeof error.code === 'string') {
    return refusalNotices[error.code] ?? null;
  }

  return null;
}
