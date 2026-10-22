import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useReducer } from 'react';
import type { EventFrom, SnapshotFrom } from 'xstate';
import { initialTransition, transition } from 'xstate';
import { formatItemCount } from '../format-item-count';
import { retiredForgetMachine } from '../retired-forget-machine';
import { css } from '../styled-system/css';
import type { RetiredForgetItem } from '../types';
import { useNixieClient } from '../use-nixie-client';
import type { RetiredForgetInput, RetiredForgetOutcome } from '../use-retired-forget';
import { useRetiredForget } from '../use-retired-forget';

export interface MemoryRetiredForgetControlProps {
  readonly onSettled: (notice: string) => void;
}

type ForgetSnapshot = SnapshotFrom<typeof retiredForgetMachine>;

type ForgetEvent = EventFrom<typeof retiredForgetMachine>;

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
  // The query client keeps every bulk call apart from this control, so a run whose cleanup failed
  // still offers its finish after the page is left and opened again.
  const forget = useRetiredForget((outcome) => {
    handleOutcome(outcome);
  });

  const [snapshot, send] = useReducer(
    (current: ForgetSnapshot, event: ForgetEvent) => {
      const [next] = transition(retiredForgetMachine, current, event);

      return next;
    },
    forget.unfinished,
    (unfinished) => {
      const [initial] = initialTransition(retiredForgetMachine, { unfinished });

      return initial;
    },
  );

  const handleOutcome = (outcome: RetiredForgetOutcome): void => {
    send({ type: outcome.kind });

    if (outcome.kind !== 'failed') {
      props.onSettled(outcome.notice);
    }
  };

  const sent = snapshot.context.sent;

  if (snapshot.matches('confirming')) {
    return <RetiredForgetConfirmation onEvent={send} onSend={forget.send} snapshot={snapshot} />;
  }

  if (snapshot.matches('idle') || snapshot.matches('done') || sent === null) {
    return (
      <button
        onClick={() => {
          send({ type: 'open' });
        }}
        type="button"
      >
        Delete retired items
      </button>
    );
  }

  return (
    <div aria-label="Finish the deletion" className={confirmation} role="group">
      {snapshot.matches('failed') ? <ForgetProgress targets={sent.targets} /> : null}
      <button
        disabled={snapshot.matches('sent')}
        onClick={() => {
          send({ type: 'retry' });

          forget.send(sent);
        }}
        type="button"
      >
        Finish the deletion
      </button>
    </div>
  );
}

interface RetiredForgetConfirmationProps {
  readonly snapshot: ForgetSnapshot;
  readonly onEvent: (event: ForgetEvent) => void;
  readonly onSend: (input: RetiredForgetInput) => void;
}

function RetiredForgetConfirmation(props: RetiredForgetConfirmationProps): ReactNode {
  const nixie = useNixieClient();
  const onEvent = props.onEvent;

  // A closed confirmation drops its preview, so the next one reads the retired items again.
  const preview = useQuery({
    ...nixie.queryUtils.memory.previewForgetRetired.queryOptions(),
    gcTime: 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const previewed = preview.data;

  useEffect(() => {
    if (previewed !== undefined) {
      onEvent({ type: 'preview.read', items: previewed.items });
    }
  }, [previewed, onEvent]);

  const items = props.snapshot.context.items;

  return (
    <div aria-label="Delete retired items" className={confirmation} role="group">
      {preview.isPending ? <p>Reading the retired items…</p> : null}
      {previewed === undefined && preview.isError ? (
        <p role="alert">The retired items did not load. Try again.</p>
      ) : null}
      {items === null || previewed === undefined ? (
        <button
          onClick={() => {
            onEvent({ type: 'cancel' });
          }}
          type="button"
        >
          Keep them
        </button>
      ) : (
        <RetiredForgetForm
          hasMore={previewed.hasMore}
          items={items}
          onEvent={onEvent}
          onSend={props.onSend}
          selected={props.snapshot.context.selected}
        />
      )}
    </div>
  );
}

interface RetiredForgetFormProps {
  readonly items: readonly RetiredForgetItem[];
  readonly selected: ReadonlySet<string>;
  readonly hasMore: boolean;
  readonly onEvent: (event: ForgetEvent) => void;
  readonly onSend: (input: RetiredForgetInput) => void;
}

const itemList = css({ display: 'flex', flexDirection: 'column', gap: '1' });

function RetiredForgetForm(props: RetiredForgetFormProps): ReactNode {
  if (props.items.length === 0) {
    return (
      <>
        <p>No retired item to delete.</p>
        <button
          onClick={() => {
            props.onEvent({ type: 'cancel' });
          }}
          type="button"
        >
          Close
        </button>
      </>
    );
  }

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
        {props.items.map((item) => (
          <li key={item.itemID}>
            <label>
              <input
                checked={props.selected.has(item.itemID)}
                onChange={(event) => {
                  props.onEvent({
                    type: 'toggle',
                    itemID: item.itemID,
                    isChecked: event.target.checked,
                  });
                }}
                type="checkbox"
              />{' '}
              {item.shortID}: {item.text ?? 'Text unreadable'} (version {item.version})
            </label>
          </li>
        ))}
      </ul>
      <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '2' })}>
        <button
          onClick={() => {
            props.onEvent({ type: 'select.all' });
          }}
          type="button"
        >
          Select all
        </button>
        <button
          onClick={() => {
            props.onEvent({ type: 'select.none' });
          }}
          type="button"
        >
          Select none
        </button>
        <button
          disabled={props.selected.size === 0}
          onClick={() => {
            const clientActionID = crypto.randomUUID();

            props.onEvent({ type: 'send', clientActionID });
            props.onSend(buildInput(clientActionID, props.items, props.selected));
          }}
          type="button"
        >
          Delete {formatItemCount(props.selected.size)} for good
        </button>
        <button
          onClick={() => {
            props.onEvent({ type: 'cancel' });
          }}
          type="button"
        >
          Keep them
        </button>
      </div>
    </>
  );
}

function buildInput(
  clientActionID: string,
  items: readonly RetiredForgetItem[],
  selected: ReadonlySet<string>,
): RetiredForgetInput {
  return {
    clientActionID,
    targets: items
      .filter((item) => selected.has(item.itemID))
      .map((item) => ({ itemID: item.itemID, version: item.version })),
  };
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
