import type { ContractOutputs } from '@heynixie/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const notice = css({ color: 'textMuted', fontSize: 'sm' });
const list = css({ display: 'flex', flexDirection: 'column', gap: '4' });

// The name and the note of a reminder were written by the agent, so they show as plain text.
export function ReminderList(): ReactNode {
  const nixie = useNixieClient();
  const listed = useQuery(nixie.queryUtils.reminders.list.queryOptions());
  const reminders = listed.data?.reminders ?? [];

  return (
    <main className={page}>
      <h1>Reminders</h1>
      {listed.isPending ? <p>Loading the reminders…</p> : null}
      {listed.isError ? (
        <p role="alert">
          The reminders did not load.{' '}
          <button
            onClick={() => {
              void listed.refetch();
            }}
            type="button"
          >
            Load them again
          </button>
        </p>
      ) : null}
      {listed.isSuccess && reminders.length === 0 ? (
        <p className={notice}>No reminder waits.</p>
      ) : null}
      <ul className={list}>
        {reminders.map((reminder) => (
          <ReminderRow key={reminder.reminder} reminder={reminder} />
        ))}
      </ul>
    </main>
  );
}

type Reminder = ContractOutputs['reminders']['list']['reminders'][number];

interface ReminderRowProps {
  readonly reminder: Reminder;
}

const name = css({ fontWeight: 'semibold', overflowWrap: 'anywhere' });
const note = css({ overflowWrap: 'anywhere' });

function ReminderRow(props: ReminderRowProps): ReactNode {
  const reminder = props.reminder;
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const cancel = useMutation({
    mutationFn: () => nixie.client.reminders.cancel({ reminder: reminder.reminder }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: nixie.queryUtils.reminders.list.key() }),
  });

  return (
    <li aria-label={reminder.name}>
      <p className={name}>{reminder.name}</p>
      <p className={note}>{reminder.note}</p>
      <p className={notice}>
        {reminder.rendered}
        {reminder.next === null ? '' : ` · next: ${new Date(reminder.next).toLocaleString()}`}
        {reminder.state === 'fired' ? ' · fired' : ''}
      </p>
      {reminder.recentFires.length === 0 ? null : (
        <p className={notice}>
          Last fires:{' '}
          {reminder.recentFires.map((fire) => new Date(fire).toLocaleString()).join(', ')}
        </p>
      )}
      {reminder.state === 'active' ? (
        <button
          disabled={cancel.isPending}
          name="cancel-reminder"
          onClick={() => {
            cancel.mutate();
          }}
          type="button"
        >
          Cancel
        </button>
      ) : null}
      {cancel.isError ? <p role="alert">The reminder did not cancel.</p> : null}
    </li>
  );
}
