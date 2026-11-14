import { ORPCError } from '@orpc/client';
import type { MutationState } from '@tanstack/react-query';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { formatItemCount } from './format-item-count';
import { useNixieClient } from './use-nixie-client';

export interface RetiredForgetInput {
  readonly clientActionID: string;
  readonly targets: readonly { readonly itemID: string; readonly version: number }[];
}

export type RetiredForgetOutcome =
  | { readonly kind: 'applied' | 'refused'; readonly notice: string }
  | { readonly kind: 'failed' };

export interface RetiredForget {
  readonly send: (input: RetiredForgetInput) => void;

  readonly unfinished: RetiredForgetInput | null;
}

const mutationKey = ['memory-forget-retired'];

export function useRetiredForget(
  onSettled: (outcome: RetiredForgetOutcome) => void,
): RetiredForget {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey,
    gcTime: Number.POSITIVE_INFINITY,
    mutationFn: (input: RetiredForgetInput) =>
      nixie.client.memory.forgetRetired({ ...input, targets: [...input.targets] }),
    onSettled: async (status, error) => {
      onSettled(buildOutcome(status, error));

      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });
    },
  });

  const calls = useMutationState({ filters: { mutationKey }, select: (call) => call.state });

  return {
    send: (input) => {
      mutation.mutate(input);
    },
    unfinished: findUnfinishedInput(calls.at(-1)),
  };
}

function buildOutcome(
  status: { readonly deleted: readonly string[] } | undefined,
  error: unknown,
): RetiredForgetOutcome {
  if (status !== undefined) {
    return {
      kind: 'applied',
      notice: `Deleted ${formatItemCount(status.deleted.length)} for good.`,
    };
  }

  const notice = findRefusalNotice(error);

  return notice === null ? { kind: 'failed' } : { kind: 'refused', notice };
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

function findUnfinishedInput(state: CallState | undefined): RetiredForgetInput | null {
  if (
    state === undefined ||
    state.status !== 'error' ||
    findRefusalNotice(state.error) !== null ||
    !isRetiredForgetInput(state.variables)
  ) {
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
