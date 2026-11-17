import type { ReactNode } from 'react';
import { findBudgetRefusal } from '../budget/find-budget-refusal';
import type { LiveRecord } from '../conversation/use-live-records';
import { css } from '../styled-system/css';

export interface BudgetNoticeProps {
  readonly records: readonly LiveRecord[];
}

const notice = css({
  color: 'textMuted',
  fontSize: 'sm',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

// Says that a budget stopped a call, with the budget and when it resets, as the tool told the model.
export function BudgetNotice(props: BudgetNoticeProps): ReactNode {
  const refusal = findBudgetRefusal(props.records);

  if (refusal === null) {
    return null;
  }

  return (
    <section aria-label="a budget was reached" className={notice}>
      <p role="status">{refusal}</p>
    </section>
  );
}
