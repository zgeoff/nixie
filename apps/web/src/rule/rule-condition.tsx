import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { RuleSentence } from './rule-sentence';

export interface RuleConditionProps {
  readonly condition: {
    readonly note: string;
    readonly noteBy: 'you' | 'nixie';
    readonly words: string;
    readonly source: string;
  };
}

const block = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });
const code = css({ fontFamily: 'mono', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });

// What a rule with a condition adds under its sentence: the note, labelled by who wrote it, the
// condition in words, and the raw expression behind a control. The host builds the words, so every
// client shows the same sentence.
export function RuleCondition(props: RuleConditionProps): ReactNode {
  const condition = props.condition;
  const label = condition.noteBy === 'you' ? 'Your note' : "nixie's note";

  return (
    <div className={block} data-testid="rule-condition">
      <p>
        <strong>{label}:</strong> {condition.note}
      </p>
      <p>
        <strong>The condition:</strong> <RuleSentence sentence={condition.words} />
      </p>
      <details>
        <summary>Show the expression</summary>
        <code className={code}>{condition.source}</code>
      </details>
    </div>
  );
}
