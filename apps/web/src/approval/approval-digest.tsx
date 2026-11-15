import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { ApprovalDigestLine } from './approval-digest-line';
import { buildBatchAnswers, isBatchable } from './build-batch-answers';
import type { DeferSettings } from './build-defer-times';
import { collectBatchRefusals } from './collect-batch-refusals';
import type { SeenApproval } from './merge-seen-approvals';
import { UnknownOutcomeCard } from './unknown-outcome-card';
import { useApprovalDigest } from './use-approval-digest';

export interface ApprovalDigestProps {
  readonly navigation?: ReactNode;
}

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });
const heading = css({ fontSize: 'lg', fontWeight: 'bold', marginTop: '4' });

const fallbackDefer: DeferSettings = {
  defaultMinutes: 60,
  eveningAt: '18:00',
  morningAt: '08:00',
  zone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// Everything that waits for an answer, in the order that matters: what always asks, what is
// routine under its task, memory, and what you deferred.
export function ApprovalDigest(props: ApprovalDigestProps): ReactNode {
  const digest = useApprovalDigest();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const entries = digest.entries;

  const section = (group: SeenApproval['group']): readonly SeenApproval[] =>
    entries.filter((entry) => entry.group === group);

  const defer = digest.defer ?? fallbackDefer;

  const showLine = (entry: SeenApproval): ReactNode => (
    <ApprovalDigestLine
      defer={defer}
      entry={entry}
      isSelected={selected.has(entry.proposalID)}
      key={entry.proposalID}
      onRefresh={digest.refresh}
      onSelect={(isSelected) => {
        setSelected((current) => toggle(current, entry.proposalID, isSelected));
      }}
    />
  );

  const always = section('always_ask');
  const routine = section('routine');
  const memory = section('memory');
  const deferred = section('deferred');

  return (
    <main className={layout}>
      <header className={header}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Approvals</h1>
        {props.navigation}
      </header>
      {digest.status === 'failed' ? (
        <p role="alert">The approvals did not load. Reload to try again.</p>
      ) : null}
      {digest.status === 'ready' && entries.length === 0 && digest.unknownOutcomes.length === 0 ? (
        <p>Nothing waits for your answer.</p>
      ) : null}
      {digest.unknownOutcomes.length === 0 ? null : (
        <section aria-label="Unknown outcomes">
          <h2 className={heading}>Did it happen?</h2>
          <ul>
            {digest.unknownOutcomes.map((item) => (
              <UnknownOutcomeCard
                item={item}
                key={item.action.actionID}
                onRefresh={digest.refresh}
              />
            ))}
          </ul>
        </section>
      )}
      {always.length === 0 ? null : (
        <section aria-label="Always asks">
          <h2 className={heading}>Always asks</h2>
          <ul>{always.map((entry) => showLine(entry))}</ul>
        </section>
      )}
      {routine.length === 0 ? null : (
        <RoutineSection
          entries={routine}
          onApproved={() => {
            setSelected(new Set());

            digest.refresh();
          }}
          showLine={showLine}
          selected={selected}
        />
      )}
      {memory.length === 0 ? null : (
        <section aria-label="Memory">
          <h2 className={heading}>Memory</h2>
          <ul>{memory.map((entry) => showLine(entry))}</ul>
        </section>
      )}
      {deferred.length === 0 ? null : (
        <details aria-label="Deferred">
          <summary className={heading}>Deferred ({deferred.length})</summary>
          <ul>{deferred.map((entry) => showLine(entry))}</ul>
        </details>
      )}
    </main>
  );
}

function toggle(
  current: ReadonlySet<string>,
  proposalID: string,
  isSelected: boolean,
): ReadonlySet<string> {
  const next = new Set(current);

  if (isSelected) {
    next.add(proposalID);
  } else {
    next.delete(proposalID);
  }

  return next;
}

const taskHeading = css({ fontSize: 'sm', fontWeight: 'semibold', marginTop: '2' });
const bar = css({ display: 'flex', flexWrap: 'wrap', gap: '2', marginBlock: '2' });

interface RoutineSectionProps {
  readonly entries: readonly SeenApproval[];
  readonly selected: ReadonlySet<string>;
  readonly showLine: (entry: SeenApproval) => ReactNode;
  readonly onApproved: () => void;
}

function RoutineSection(props: RoutineSectionProps): ReactNode {
  const client = useNixieClient().client;
  const [refusals, setRefusals] = useState<readonly string[]>([]);
  const batchable = props.entries.filter((entry) => isBatchable(entry));

  const approve = useMutation({
    mutationFn: async (entries: readonly SeenApproval[]) => {
      const lines: string[] = [];

      for (const answers of buildBatchAnswers(entries, () => crypto.randomUUID())) {
        const sent = await client.approvals.answerProposals({ answers: [...answers] });

        lines.push(...collectBatchRefusals(sent.results, props.entries));
      }

      return lines;
    },
    onSuccess: (lines) => {
      setRefusals(lines);

      props.onApproved();
    },
  });

  const chosen = batchable.filter((entry) => props.selected.has(entry.proposalID));
  const tasks = [...new Set(props.entries.map((entry) => entry.item.task?.name ?? 'No task'))];

  return (
    <section aria-label="Routine">
      <h2 className={heading}>Routine</h2>
      <div className={bar}>
        <button
          disabled={approve.isPending || chosen.length === 0}
          name="approve-selected"
          onClick={() => {
            approve.mutate(chosen);
          }}
          type="button"
        >
          Approve selected
        </button>
        <button
          disabled={approve.isPending || batchable.length === 0}
          name="approve-all"
          onClick={() => {
            approve.mutate(batchable);
          }}
          type="button"
        >
          Approve all routine
        </button>
      </div>
      {approve.isError ? <p role="alert">The answers did not finish. Try again.</p> : null}
      {refusals.length === 0 ? null : (
        <ul aria-label="Answers that changed nothing" role="status">
          {refusals.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {tasks.map((task) => (
        <div key={task}>
          <h3 className={taskHeading}>{task}</h3>
          <ul>
            {props.entries
              .filter((entry) => (entry.item.task?.name ?? 'No task') === task)
              .map((entry) => props.showLine(entry))}
          </ul>
        </div>
      ))}
    </section>
  );
}
