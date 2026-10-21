import type { ReactNode } from 'react';
import type { CompactionActivity, ContextActivity } from '../build-activity';
import { formatCompaction } from '../format-compaction';
import { formatContext } from '../format-context';
import { StepSection } from './step-section';

export interface StepContextProps {
  readonly compactions: readonly CompactionActivity[];
  readonly context: ContextActivity | undefined;
}

export function StepContext(props: StepContextProps): ReactNode {
  return (
    <StepSection title="Context">
      {props.context === undefined ? null : <p>{formatContextLine(props.context)}</p>}
      {props.compactions.map((compaction) => (
        <p key={compaction.sequence}>{formatCompaction(compaction)}</p>
      ))}
    </StepSection>
  );
}

function formatContextLine(context: ContextActivity): string {
  const percent = Math.round((context.size / context.window) * 100);

  return `${formatContext(context)} tokens · ${percent}% at the last model call`;
}
