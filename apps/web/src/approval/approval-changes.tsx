import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { ApprovalChange } from './build-approval-changes';

export interface ApprovalChangesProps {
  readonly changes: readonly ApprovalChange[];
}

const list = css({ display: 'flex', flexDirection: 'column', gap: '1', fontSize: 'sm' });

// What the host holds now against what the card showed. The answer goes against the new hashes.
export function ApprovalChanges(props: ApprovalChangesProps): ReactNode {
  return (
    <div aria-label="What changed" role="group">
      <p>This changed after you opened it. Check it before you answer.</p>
      <ul className={list}>
        {props.changes.map((change) => (
          <li key={change.label}>
            <strong>{change.label}:</strong>{' '}
            {change.parts.map((part, index) => (
              <ChangePart key={index} part={part} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

const removed = css({ textDecoration: 'line-through' });
const added = css({ fontWeight: 'bold', textDecoration: 'underline' });

interface ChangePartProps {
  readonly part: ApprovalChange['parts'][number];
}

function ChangePart(props: ChangePartProps): ReactNode {
  if (props.part.kind === 'removed') {
    return <del className={removed}>{props.part.text}</del>;
  }

  if (props.part.kind === 'added') {
    return <ins className={added}>{props.part.text}</ins>;
  }

  return <span>{props.part.text}</span>;
}
