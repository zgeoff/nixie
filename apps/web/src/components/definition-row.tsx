import type { ContractOutputs } from '@heynixie/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { formatDefinitionRefusal } from './format-definition-refusal';

type Definition = ContractOutputs['definitions']['listTasks']['definitions'][number];

export interface DefinitionRowProps {
  readonly definition: Definition;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });
const name = css({ fontWeight: 'semibold', overflowWrap: 'anywhere' });

// The name of a definition was written by the agent, so it shows as plain text.
export function DefinitionRow(props: DefinitionRowProps): ReactNode {
  const definition = props.definition;
  const origin = definition.origin === 'nixie' ? 'Made by nixie' : 'From the definitions repo';
  const createdBy = `${definition.createdBy.kind} record ${definition.createdBy.sequence}`;

  return (
    <li aria-label={definition.isUnreadable ? 'Definition' : definition.name}>
      <p className={name}>{definition.isUnreadable ? '[content unavailable]' : definition.name}</p>
      <p className={quiet}>
        {definition.rendered ?? 'No trigger'}
        {definition.next === null ? '' : ` · next: ${definition.next}`}
        {definition.enabled ? '' : ' · off'}
      </p>
      <p className={quiet}>
        {origin} · created by the {createdBy}
      </p>
      {definition.origin === 'nixie' && definition.createdBy.kind === 'definition.changed' ? (
        <UndoControl definition={definition} />
      ) : null}
    </li>
  );
}

interface UndoControlProps {
  readonly definition: Definition;
}

// The change that put the definition in force sits in the record that created it, so the control
// reads that record for the change ID that the undo names.
function UndoControl(props: UndoControlProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const sequence = props.definition.createdBy.sequence;
  const [refusal, setRefusal] = useState<string | null>(null);

  const created = useQuery(
    nixie.queryUtils.conversation.read.queryOptions({
      input: { beforeSequence: sequence + 1, clipPayloads: true, limit: 1, thread: 'conversation' },
    }),
  );

  const changeID = created.data?.records.find((record) => record.sequence === sequence)
    ?.definitionNotice?.changeID;

  const undo = useMutation({
    mutationFn: () =>
      nixie.client.definitions.undo({
        clientActionID: crypto.randomUUID(),
        changeID: changeID ?? '',
      }),
    onSuccess: () => {
      setRefusal(null);

      return queryClient.invalidateQueries({
        queryKey: nixie.queryUtils.definitions.listTasks.key(),
      });
    },
    onError: (error) => {
      setRefusal(formatDefinitionRefusal(error));
    },
  });

  return (
    <p>
      <button
        disabled={changeID === undefined || undo.isPending}
        name="undo-definition"
        onClick={() => {
          undo.mutate();
        }}
        type="button"
      >
        Undo
      </button>
      {refusal === null ? null : <span role="alert"> {refusal}</span>}
    </p>
  );
}
