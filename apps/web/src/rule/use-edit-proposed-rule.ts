import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { useNixieClient } from '../utils/use-nixie-client';
import { describeRuleError } from './describe-rule-error';

export interface ProposedRuleEdit {
  readonly proposalID: string;
  readonly actionHash: string;
  readonly rule: Readonly<Record<string, unknown>>;
}

export interface ProposedRuleEditor {
  readonly edit: (input: ProposedRuleEdit) => void;
  readonly isPending: boolean;
  readonly faults: readonly string[];
}

export interface ProposedRuleEditorOptions {
  readonly onEdited: () => void;
}

// Sends an edited rule, which withdraws the proposal and opens a new one. A second send of the
// same edit reuses its client action ID, so a retry after a lost reply settles once.
export function useEditProposedRule(options: ProposedRuleEditorOptions): ProposedRuleEditor {
  const client = useNixieClient().client;
  const last = useRef<{ readonly signature: string; readonly clientActionID: string } | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: ProposedRuleEdit) => {
      const signature = JSON.stringify(input);

      const clientActionID =
        last.current?.signature === signature ? last.current.clientActionID : crypto.randomUUID();

      last.current = { signature, clientActionID };

      await client.rules.editProposedRule({ ...input, clientActionID });
    },
    onSuccess: options.onEdited,
  });

  return {
    edit: (input) => {
      mutation.mutate(input);
    },
    isPending: mutation.isPending,
    faults: mutation.isError ? describeRuleError(mutation.error) : [],
  };
}
