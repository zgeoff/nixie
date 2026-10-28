import type { ContractInputs } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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

interface MomentEditAttempt extends MomentEditInput {
  readonly clientActionID: string;
}

export function useMomentEdit(momentID: string, onApplied?: () => void): MomentEdit {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  // A failure with no answer may have committed, so sending the same change again repeats that
  // attempt whole, with its action ID and its version, and the API answers with the first result.
  const [uncertain, setUncertain] = useState<MomentEditAttempt | null>(null);

  const mutation = useMutation({
    mutationFn: (attempt: MomentEditAttempt) => {
      const target = {
        clientActionID: attempt.clientActionID,
        momentID,
        version: attempt.version,
      };

      const change = attempt.change;

      return change.kind === 'link'
        ? nixie.client.memory.linkMoment({
            ...target,
            itemID: change.itemID,
            isLinked: change.isLinked,
          })
        : nixie.client.memory.editMoment({ ...target, change });
    },
    onError: (error, attempt) => {
      const unanswered = findRefusalCode(error) === null ? attempt : null;

      setUncertain(unanswered);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });
    },
    onSuccess: () => {
      setUncertain(null);
      onApplied?.();
    },
  });

  return {
    send: (input) => {
      const isRepeat =
        uncertain !== null && JSON.stringify(uncertain.change) === JSON.stringify(input.change);

      const attempt = isRepeat ? uncertain : { ...input, clientActionID: crypto.randomUUID() };

      mutation.mutate(attempt);
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

function findRefusalCode(error: unknown): string | null {
  if (error instanceof ORPCError && typeof error.code === 'string' && error.code in editNotices) {
    return error.code;
  }

  return null;
}

function pickEditNotice(error: unknown): string {
  return editNotices[findRefusalCode(error) ?? ''] ?? 'The change did not save. Try again.';
}
