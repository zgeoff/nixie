import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { LiveRecord } from '../conversation/use-live-records';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { formatDefinitionNotice } from './format-definition-notice';
import { formatDefinitionRefusal } from './format-definition-refusal';

export interface DefinitionNoticeProps {
  readonly notice: NonNullable<LiveRecord['definitionNotice']>;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });

// A change of a task definition, with an undo while the change is the one in force. The undo goes
// through the owner's checked action; a refusal shows its own sentence.
export function DefinitionNotice(props: DefinitionNoticeProps): ReactNode {
  const notice = props.notice;
  const nixie = useNixieClient();
  const [isUndone, setUndone] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const undo = useMutation({
    mutationFn: () =>
      nixie.client.definitions.undo({
        clientActionID: crypto.randomUUID(),
        changeID: notice.changeID,
      }),
    onSuccess: () => {
      setUndone(true);
      setRefusal(null);
    },
    onError: (error) => {
      setRefusal(formatDefinitionRefusal(error));
    },
  });

  const canUndo = (notice.state === 'in_force' || notice.state === 'adopted') && !isUndone;

  return (
    <li className={quiet} role="note">
      <span>{formatDefinitionNotice(notice)}</span>{' '}
      {canUndo ? (
        <button
          disabled={undo.isPending}
          name="undo-definition"
          onClick={() => {
            undo.mutate();
          }}
          type="button"
        >
          Undo
        </button>
      ) : null}
      {isUndone ? <span role="status">Undone.</span> : null}
      {refusal === null ? null : <span role="alert">{refusal}</span>}
    </li>
  );
}
