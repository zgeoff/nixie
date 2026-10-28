import type { ReactNode } from 'react';
import { css } from '../styled-system/css';

export interface MomentDraftConflictProps {
  readonly onTakeLatest: () => void;
  readonly onKeepDraft: () => void;
}

export function MomentDraftConflict(props: MomentDraftConflictProps): ReactNode {
  return (
    <div
      aria-label="The moment changed"
      className={css({ display: 'flex', flexDirection: 'column', gap: '1' })}
      role="group"
    >
      <p>
        This moment changed after you started. Take the latest version, or keep your draft and save
        it over the change.
      </p>
      <div className={css({ display: 'flex', gap: '2' })}>
        <button onClick={props.onTakeLatest} type="button">
          Take the latest
        </button>
        <button onClick={props.onKeepDraft} type="button">
          Keep my draft
        </button>
      </div>
    </div>
  );
}
