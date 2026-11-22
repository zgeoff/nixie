import type { ReactNode } from 'react';
import { buildWordDiff } from '../conversation/build-word-diff';
import { css } from '../styled-system/css';

export interface WordDiffProps {
  readonly before: string;
  readonly after: string;
}

// The words that changed between 2 texts: added words marked as inserted, removed ones as deleted.
export function WordDiff(props: WordDiffProps): ReactNode {
  const parts = buildWordDiff(props.before, props.after);

  return parts.map((part, index) => <DiffRun key={index} kind={part.kind} text={part.text} />);
}

interface DiffRunProps {
  readonly kind: 'same' | 'added' | 'removed';
  readonly text: string;
}

function DiffRun(props: DiffRunProps): ReactNode {
  if (props.kind === 'added') {
    return <ins className={css({ backgroundColor: 'surface' })}>{props.text}</ins>;
  }

  if (props.kind === 'removed') {
    return <del className={css({ color: 'textMuted' })}>{props.text}</del>;
  }

  return props.text;
}
