import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { parseRuleSentence } from './parse-rule-sentence';

export interface RuleSentenceProps {
  readonly sentence: string;
}

const code = css({ fontFamily: 'mono', fontSize: 'sm' });

export function RuleSentence(props: RuleSentenceProps): ReactNode {
  return parseRuleSentence(props.sentence).map((part, index) => {
    const key = `${String(index)}-${part.kind}`;

    if (part.kind === 'strong') {
      return <strong key={key}>{part.text}</strong>;
    }

    return part.kind === 'code' ? (
      <code className={code} key={key}>
        {part.text}
      </code>
    ) : (
      <span key={key}>{part.text}</span>
    );
  });
}
