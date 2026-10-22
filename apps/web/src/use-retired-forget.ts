import { ORPCError } from '@orpc/client';
import type { MutationState } from '@tanstack/react-query';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { formatItemCount } from './format-item-count';
import { useNixieClient } from './use-nixie-client';

export interface RetiredForgetInput {
  readonly clientActionID: string;
  readonly targets: readonly { readonly itemID: string; readonly version: number }[];
}

export interface RetiredForget {
  readonly send: (input: RetiredForgetInput) => void;

  readonly isPending: boolean;

  readonly hasFailed: boolean;

  readonly unfinished: RetiredForgetInput | null;
}

const mutationKey = ['memory-forget-retired'];

export function useRetiredForget(onSettled: (notice: string) => void): RetiredForget {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey,
    gcTime: Number.POSITIVE_INFINITY,
    mutationFn: (input: RetiredForgetInput) =>
      nixie.client.memory.forgetRetired({ ...input, targets: [...input.targets] }),
    onSettled: async (status, error) => {
      const notice =
        status === undefined
          ? findRefusalNotice(error)
          : `Deleted ${formatItemCount(status.deleted.length)} for good.`;

      if (notice !== null) {
        onSettled(notice);
      }

      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });
    },
  });

  const calls = useMutationState({ filters: { mutationKey }, select: (call) => call.state });

  return {
    send: (input) => {
      mutation.mutate(input);
    },
    isPending: mutation.isPending,
    hasFailed: isUnfinished(mutation),
    unfinished: findUnfinishedInput(calls.at(-1)),
  };
}

const refusalNotices: Readonly<Record<string, string>> = {
  MEMORY_ITEM_NOT_FOUND:
    'An item in the list is gone, so nothing was deleted. Check the retired items, then try again.',
  STALE_VERSION:
    'An item changed after the list loaded, so nothing was deleted. Check the retired items, then try again.',
  WRONG_STATE:
    'An item is no longer retired, so nothing was deleted. Check the retired items, then try again.',
};

function findRefusalNotice(error: unknown): string | null {
  if (error instanceof ORPCError && typeof error.code === 'string') {
    return refusalNotices[error.code] ?? null;
  }

  return null;
}

type CallState = Pick<MutationState, 'status' | 'variables' | 'error'>;

function isUnfinished(state: CallState): boolean {
  return state.status === 'error' && findRefusalNotice(state.error) === null;
}

function findUnfinishedInput(state: CallState | undefined): RetiredForgetInput | null {
  if (state === undefined || !isUnfinished(state) || !isRetiredForgetInput(state.variables)) {
    return null;
  }

  return state.variables;
}

function isRetiredForgetInput(value: unknown): value is RetiredForgetInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'clientActionID' in value &&
    'targets' in value &&
    Array.isArray(value.targets)
  );
}
