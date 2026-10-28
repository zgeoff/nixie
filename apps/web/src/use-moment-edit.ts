import type { ContractInputs } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNixieClient } from './use-nixie-client';

type MomentEditChange =
  | ContractInputs['memory']['editMoment']['change']
  | { readonly kind: 'link'; readonly itemID: string; readonly isLinked: boolean };

interface MomentEditInput {
  readonly change: MomentEditChange;
  readonly version: number;
}

export interface MomentEdit {
  readonly send: (input: MomentEditInput) => void;

  readonly isPending: boolean;
  readonly notice: string | null;
}

export function useMomentEdit(momentID: string, onApplied?: () => void): MomentEdit {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: MomentEditInput) => {
      const target = { clientActionID: crypto.randomUUID(), momentID, version: input.version };
      const change = input.change;

      return change.kind === 'link'
        ? nixie.client.memory.linkMoment({
            ...target,
            itemID: change.itemID,
            isLinked: change.isLinked,
          })
        : nixie.client.memory.editMoment({ ...target, change });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });
    },
    onSuccess: () => {
      onApplied?.();
    },
  });

  return {
    send: (input) => {
      mutation.mutate(input);
    },
    isPending: mutation.isPending,
    notice: mutation.isError ? pickEditNotice(mutation.error) : null,
  };
}

const editNotices: Readonly<Record<string, string>> = {
  MOMENT_NOT_FOUND: 'This moment is gone. It was destroyed after the page loaded.',
  STALE_VERSION: 'This moment changed after the page loaded. Check it, then try again.',
  BAD_SPAN: 'The first and last records must both be on this thread, in order.',
  REFLECTION_NOT_FOUND: 'That reflection is already gone.',
  MEMORY_ITEM_NOT_FOUND: 'No memory item has that ID.',
  ALREADY_LINKED: 'That memory item is already linked.',
  NOT_LINKED: 'That memory item is no longer linked.',
};

function pickEditNotice(error: unknown): string {
  const code = error instanceof ORPCError && typeof error.code === 'string' ? error.code : '';

  return editNotices[code] ?? 'The change did not save. Try again.';
}
