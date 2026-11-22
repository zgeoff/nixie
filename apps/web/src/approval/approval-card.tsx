import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { RuleDraft } from '../rule/rule-draft';
import { toRuleDraft } from '../rule/rule-draft';
import { RuleSentence } from '../rule/rule-sentence';
import { css } from '../styled-system/css';
import type { ApprovalRead } from '../types';
import { ApprovalChanges } from './approval-changes';
import { ApprovalControls } from './approval-controls';
import { ApprovalImages } from './approval-images';
import { ApprovalMemoryBody } from './approval-memory-body';
import { ApprovalRuleEditor } from './approval-rule-editor';
import { ApprovalRuleNotice } from './approval-rule-notice';
import { ApprovalScreen } from './approval-screen';
import { buildApprovalChanges } from './build-approval-changes';
import type { DeferSettings } from './build-defer-times';
import { formatApprovalCause } from './format-approval-cause';
import { formatApprovalState } from './format-approval-state';
import { formatLapsesIn } from './format-lapses-in';
import type { ApprovalOutcome } from './use-approval-answer';
import { useApprovalAnswer } from './use-approval-answer';

export interface ApprovalCardProps {
  readonly item: ApprovalRead;
  readonly defer: DeferSettings;

  // asks the parent to read the row again, after an answer or a refusal
  readonly onRefresh: () => void;

  // called once an Always allow added its rule, so a parent keeps the card's notice on screen
  readonly onRuleAdded?: () => void;
}

const frames = {
  routine: css({ borderRadius: 'md', borderWidth: '1px', padding: '3' }),
  always_ask: css({
    borderColor: 'borderStrong',
    borderRadius: 'md',
    borderStyle: 'solid',
    borderWidth: '4px',
    padding: '3',
  }),
  lifting: css({
    backgroundColor: 'text',
    borderRadius: 'md',
    color: 'canvas',
    padding: '3',
    '& button': { color: 'text' },
  }),
} as const;

const frameLabels = {
  routine: 'Routine proposal',
  always_ask: 'Always-ask proposal',
  lifting: 'Lifting proposal',
} as const;

const marker = css({ fontSize: 'sm', fontWeight: 'bold', textTransform: 'uppercase' });
const meta = css({ fontSize: 'sm', opacity: '0.8' });
const stack = css({ display: 'flex', flexDirection: 'column', gap: '2' });

// One proposal as a card. The text and the state come from the row and its answer results, never
// from a model's reply. A card keeps the body it first showed, so a change under it shows as a
// before and after, and the next answer goes against what the host holds now.
export function ApprovalCard(props: ApprovalCardProps): ReactNode {
  const item = props.item;
  const proposal = item.proposal;
  const body = item.body;
  const [shown] = useState(item);
  const [outcome, setOutcome] = useState<ApprovalOutcome | null>(null);
  const [ruleID, setRuleID] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);
  const [hasSeenBounds, setSeenBounds] = useState(false);
  const isOpen = proposal.state === 'pending' || proposal.state === 'deferred';

  const answerer = useApprovalAnswer({
    passkeyChoices: item.passkeyChoices,
    onOutcome: (next) => {
      setOutcome(next);

      if (next.status === 'answered' && next.result.state === 'approved' && next.result.rule) {
        setRuleID(next.result.rule.id);
        props.onRuleAdded?.();
      }

      props.onRefresh();
    },
  });

  const isChanged =
    shown.proposal.actionHash !== proposal.actionHash ||
    shown.proposal.ruleHash !== proposal.ruleHash;

  const changes =
    isChanged && shown.body !== null && body !== null ? buildApprovalChanges(shown.body, body) : [];

  const state = formatApprovalState(item);
  const isLifting = proposal.riskClass === 'lifting';
  const memory = body?.memory;
  const proposedRule = proposal.cause === 'proposed_rule' ? body?.rule : undefined;
  const editedText = memory === undefined || draft === null || draft === memory.text ? null : draft;

  const closeMatch =
    outcome?.status === 'answered' && outcome.result.state === 'pending'
      ? outcome.result.closeMatch
      : null;

  return (
    <section
      aria-label={frameLabels[proposal.riskClass]}
      className={`${frames[proposal.riskClass]} ${stack}`}
    >
      {proposal.riskClass === 'always_ask' ? <p className={marker}>Always asks</p> : null}
      {isLifting ? <p className={marker}>Lifts the always-ask set</p> : null}
      {body === null ? (
        <p>The details of this proposal are gone, so it cannot be shown.</p>
      ) : (
        <>
          {memory === undefined ? (
            <p className={css({ fontWeight: 'semibold' })}>
              {proposal.kind === 'internal_change' ? (
                <RuleSentence sentence={body.sentence} />
              ) : (
                body.sentence
              )}
            </p>
          ) : (
            <ApprovalMemoryBody draft={draft} memory={memory} onDraft={setDraft} />
          )}
          {isLifting && !hasSeenBounds && isOpen ? (
            <button
              onClick={() => {
                setSeenBounds(true);
              }}
              type="button"
            >
              Show the rule's bounds
            </button>
          ) : (
            <Bounds body={body} />
          )}
          {body.images === undefined || body.images.length === 0 ? null : (
            <ApprovalImages imageIDs={body.images} />
          )}
          {body.screen === undefined ? null : <ApprovalScreen screen={body.screen} />}
          <p className={meta}>Asked because: {formatApprovalCause({ proposal, body })}</p>
        </>
      )}
      {item.task === null ? null : <p className={meta}>Task: {item.task.name}</p>}
      {isOpen ? <p className={meta}>{formatLapsesIn(proposal.lapsesAt, new Date())}</p> : null}
      {state === null ? null : <p role="status">{state}</p>}
      {changes.length === 0 && !isChanged ? null : <ApprovalChanges changes={changes} />}
      {closeMatch === null ? null : (
        <div aria-label="An active item already says this" role="group">
          <p className={meta}>An active item already says this: “{closeMatch.text}”</p>
          <button
            disabled={answerer.isPending}
            onClick={() => {
              answerer.send({
                proposalID: proposal.proposalID,
                actionHash: proposal.actionHash,
                choice: 'approve',
                memory: {
                  ...(editedText === null ? {} : { editedText }),
                  revisionOf: { itemID: closeMatch.itemID, version: closeMatch.version },
                },
              });
            }}
            type="button"
          >
            Revise that item
          </button>
          <button
            disabled={answerer.isPending}
            onClick={() => {
              answerer.send({
                proposalID: proposal.proposalID,
                actionHash: proposal.actionHash,
                choice: 'approve',
                memory: { ...(editedText === null ? {} : { editedText }), ignoreCloseMatch: true },
              });
            }}
            type="button"
          >
            Add as a new item
          </button>
        </div>
      )}
      {ruleDraft === null ? null : (
        <ApprovalRuleEditor
          draft={ruleDraft}
          item={item}
          onDraft={setRuleDraft}
          onEdited={() => {
            setRuleDraft(null);

            props.onRefresh();
          }}
        />
      )}
      <OutcomeLine isFailed={answerer.isFailed} outcome={outcome} />
      {isOpen && body !== null && closeMatch === null ? (
        <ApprovalControls
          answerer={answerer}
          defer={props.defer}
          editedText={editedText}
          isApprovable={!isLifting || hasSeenBounds}
          isEditable={
            (memory?.operation === 'remember' && memory.labels?.isLabelOnly !== true) ||
            proposedRule !== undefined
          }
          isEditing={draft !== null || ruleDraft !== null}
          isRuleProposal={proposal.cause === 'proposed_rule'}
          item={item}
          onEditToggle={() => {
            if (proposedRule !== undefined) {
              const nextRule = ruleDraft === null ? toRuleDraft(proposedRule) : null;

              setRuleDraft(nextRule);

              return;
            }

            const next = draft === null ? (memory?.text ?? null) : null;

            setDraft(next);
          }}
        />
      ) : null}
      {ruleID === null ? null : <ApprovalRuleNotice ruleID={ruleID} />}
    </section>
  );
}

const fieldList = css({ fontSize: 'sm', display: 'grid', gap: '1' });

interface BoundsProps {
  readonly body: NonNullable<ApprovalRead['body']>;
}

// A mandate names each of its rules in a field `rule 1`, `rule 2` and on, as a rule sentence.
const ruleFieldPattern = /^rule \d+$/u;

function Bounds(props: BoundsProps): ReactNode {
  const fields = Object.entries(props.body.fields);

  return (
    <>
      {fields.length === 0 ? null : (
        <dl className={fieldList}>
          {fields.map(([name, value]) => (
            <div key={name}>
              <dt className={css({ fontWeight: 'semibold' })}>{name}</dt>
              <dd className={css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' })}>
                {ruleFieldPattern.test(name) ? <RuleSentence sentence={value} /> : value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {props.body.ruleSentence === null ? null : (
        <p className={meta}>
          Always allow adds this rule: <RuleSentence sentence={props.body.ruleSentence} />
        </p>
      )}
    </>
  );
}

interface OutcomeLineProps {
  readonly outcome: ApprovalOutcome | null;
  readonly isFailed: boolean;
}

const refusals: Readonly<Record<string, string>> = {
  not_found: 'This proposal is gone, so nothing changed.',
  choice: 'This answer is not offered for this proposal, so nothing changed.',
};

function OutcomeLine(props: OutcomeLineProps): ReactNode {
  if (props.isFailed) {
    return <p role="alert">The answer did not finish. Answer again to retry it.</p>;
  }

  const outcome = props.outcome;

  if (outcome?.status === 'closed') {
    return <p role="alert">This proposal was answered, withdrawn or lapsed, so nothing changed.</p>;
  }

  if (outcome?.status === 'no_passkey') {
    return (
      <p role="alert">
        No passkey is set up, so nothing changed. <Link to="/passkeys">Add a passkey</Link>, or run
        nixie passkey-code on the host for a one-time code.
      </p>
    );
  }

  if (outcome?.status === 'passkey_failed') {
    return <p role="alert">The passkey check did not pass, so nothing changed. Try again.</p>;
  }

  if (outcome?.status === 'refused') {
    return (
      <p role="alert">
        {refusals[outcome.reason] ?? 'The host refused this answer, so nothing changed.'}
      </p>
    );
  }

  return null;
}
