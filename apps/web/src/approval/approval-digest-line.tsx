import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { RuleSentence } from '../rule/rule-sentence';
import { toPlainRuleSentence } from '../rule/to-plain-rule-sentence';
import { css } from '../styled-system/css';
import { ApprovalCard } from './approval-card';
import { isBatchable } from './build-batch-answers';
import type { DeferSettings } from './build-defer-times';
import { formatApprovalState } from './format-approval-state';
import type { SeenApproval } from './merge-seen-approvals';

export interface ApprovalDigestLineProps {
  readonly entry: SeenApproval;
  readonly defer: DeferSettings;
  readonly onRefresh: () => void;

  readonly isOpenedAtStart: boolean;
  readonly isSelected: boolean;
  readonly onSelect: (isSelected: boolean) => void;
}

const line = css({ borderBottomWidth: '1px', paddingBlock: '2' });
const summary = css({ cursor: 'pointer', overflowWrap: 'anywhere' });
const state = css({ color: 'textMuted', fontSize: 'sm' });

// One row as a line that opens to its card. A routine row also carries a checkbox for the batch.
// A row that closes collapses to its state and the device that answered, unless its Always allow
// added a rule, whose notice stays on screen.
export function ApprovalDigestLine(props: ApprovalDigestLineProps): ReactNode {
  const item = props.entry.item;
  const [isExpanded, setExpanded] = useState(props.isOpenedAtStart);
  const [hasNotice, setHasNotice] = useState(false);
  const isOpen = item.proposal.state === 'pending' || item.proposal.state === 'deferred';
  const sentence = item.body?.sentence ?? `Proposal ${item.proposal.shortID}`;
  const isRuleChange = item.proposal.kind === 'internal_change';
  const stateText = formatApprovalState(item);

  useEffect(() => {
    if (!isOpen && !hasNotice) {
      setExpanded(false);
    }
  }, [hasNotice, isOpen]);

  return (
    <li
      aria-label={isRuleChange ? toPlainRuleSentence(sentence) : sentence}
      className={line}
      data-state={item.proposal.state}
    >
      {isBatchable(props.entry) ? (
        <label className={state}>
          <input
            checked={props.isSelected}
            onChange={(event) => {
              props.onSelect(event.target.checked);
            }}
            type="checkbox"
          />{' '}
          Select
        </label>
      ) : null}
      <details
        onToggle={(event) => {
          setExpanded(event.currentTarget.open);
        }}
        open={isExpanded}
      >
        <summary className={summary}>
          {isRuleChange ? <RuleSentence sentence={sentence} /> : sentence}
          {stateText === null || isOpen ? null : <span className={state}> · {stateText}</span>}
        </summary>
        <ApprovalCard
          defer={props.defer}
          item={item}
          onRefresh={props.onRefresh}
          onRuleAdded={() => {
            setHasNotice(true);
          }}
        />
      </details>
    </li>
  );
}
