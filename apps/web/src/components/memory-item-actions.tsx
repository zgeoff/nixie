import { ORPCError } from '@orpc/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { useNixieClient } from '../use-nixie-client';
import { MemoryForgetControl } from './memory-forget-control';

export interface MemoryItemActionsProps {
  readonly item: MemoryItem;

  // tells the view how a confirmed change ended: what to tell the user when it was refused, or
  // null when it applied
  readonly onSettled: (notice: string | null) => void;
}

type MemoryChange = 'retire' | 'restore' | 'pin' | 'unpin';

// a confirmation keeps the version it asked about, so a list that refreshes under it never moves
// the change onto a version the user did not see
interface PendingChange {
  readonly change: MemoryChange;
  readonly actionID: string;
  readonly version: number;
}

const labels = { pin: 'Pin', restore: 'Restore', retire: 'Retire', unpin: 'Unpin' };

const controls = css({
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

// The checked changes to one item, its forget included, each bound to the version the row shows:
// only the confirm changes it, and each confirmation keeps one client action ID, so a confirm that
// fails and goes again changes the item once.
export function MemoryItemActions(props: MemoryItemActionsProps): ReactNode {
  const [pending, setPending] = useState<PendingChange | null>(null);
  const changes = pickChanges(props.item);

  // an item a forget began takes no change, and only the forget can still finish
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

// the changes an item's state allows: none once a forget began, even while its text still opens,
// and a retire takes an item out of the pinned core; an item of any subject joins it
function pickChanges(item: MemoryItem): readonly MemoryChange[] {
  if (item.state === 'forgetting' || item.state === 'forgotten') {
    return [];
  }

  if (item.state === 'retired') {
    return item.isPinned ? ['restore', 'unpin'] : ['restore'];
  }

  if (item.isPinned) {
    return ['retire', 'unpin'];
  }

  return ['retire', 'pin'];
}

const questions = {
  pin: 'Pin this item? Every session opens with it.',
  restore: 'Restore this item? Recalls find it again.',
  retire: 'Retire this item? Recalls stop finding it, and you can restore it.',
  unpin: 'Unpin this item? Sessions stop opening with it.',
};

interface ChangeConfirmationProps {
  readonly itemID: string;
  readonly version: number;
  readonly change: MemoryChange;
  readonly actionID: string;

  readonly onCancel: () => void;

  // closes the confirmation once the change applied or was refused, with the refusal's reason
  readonly onSettled: (notice: string | null) => void;
}

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

    // a change or a refusal leaves the item in a state the lists may not show yet
    onSettled: () => queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() }),
    onSuccess: () => {
      props.onSettled(null);
    },
  });

  return (
    <div aria-label={`${labels[props.change]} this item`} className={confirmation} role="group">
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

  if (props.change === 'retire') {
    await client.memory.retire(input);
  } else if (props.change === 'restore') {
    await client.memory.restore(input);
  } else {
    await client.memory.pin({ ...input, isPinned: props.change === 'pin' });
  }
}

const refusalNotices: Readonly<Record<string, string>> = {
  MEMORY_ITEM_NOT_FOUND: 'This item is gone. It was forgotten after the list loaded.',
  PINNED_CORE_FULL: 'The pinned core has no room for this item. Unpin another item first.',
  STALE_VERSION:
    'This item changed after you opened it, so nothing changed. Check it, then try again.',
  WRONG_STATE: 'This item moved to another state after you opened it, so nothing changed.',
};

// a refusal closes the confirmation with its reason; any other failure keeps it open to retry
function findRefusalNotice(error: unknown): string | null {
  if (error instanceof ORPCError && typeof error.code === 'string') {
    return refusalNotices[error.code] ?? null;
  }

  return null;
}
