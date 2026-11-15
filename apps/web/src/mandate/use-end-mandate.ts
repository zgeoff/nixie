import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeRuleError } from '../rule/describe-rule-error';
import { useNixieClient } from '../utils/use-nixie-client';

export interface MandateEnder {
  readonly end: (mandateID: string) => void;
  readonly isPending: boolean;
  readonly message: string | null;
}

// Ends a mandate at once, which retires its rules. Each tap is its own action.
export function useEndMandate(): MandateEnder {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (mandateID: string) =>
      nixie.client.rules.endMandate({ mandateID, clientActionID: crypto.randomUUID() }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: nixie.queryUtils.rules.listMandates.key() }),
  });

  return {
    end: (mandateID) => {
      mutation.mutate(mandateID);
    },
    isPending: mutation.isPending,
    message: mutation.isError ? (describeRuleError(mutation.error)[0] ?? null) : null,
  };
}
