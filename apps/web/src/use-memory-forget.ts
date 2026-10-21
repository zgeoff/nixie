import { ORPCError } from '@orpc/client';
import type { MutationState } from '@tanstack/react-query';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useNixieClient } from './use-nixie-client';

interface MemoryForgetInput {
  readonly clientActionID: string;
  readonly itemID: string;
  readonly version: number;
}

type MemoryForgetCall =
  | { readonly status: 'pending' | 'applied' | 'failed'; readonly input: MemoryForgetInput }
  | { readonly status: 'refused'; readonly input: MemoryForgetInput; readonly notice: string };

export interface MemoryForget {
  readonly send: (input: MemoryForgetInput) => void;

  readonly own: MemoryForgetCall | null;

  readonly last: MemoryForgetCall | null;
}

export function useMemoryForget(
  itemID: string,
  onSettled: (notice: string | null) => void,
): MemoryForget {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const mutationKey = ['memory-forget', itemID];

  const mutation = useMutation({
    mutationKey,
    gcTime: Number.POSITIVE_INFINITY,
    mutationFn: (input: MemoryForgetInput) => nixie.client.memory.forget(input),
    onError: async (error) => {
      const notice = findRefusalNotice(error);

      if (notice !== null) {
        onSettled(notice);

        await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });
      }
    },
    onSuccess: async () => {
      onSettled(null);

      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() });
    },
  });

  const calls = useMutationState({
    filters: { mutationKey },
    select: (call) => toCall(call.state),
  });

  return {
    send: (input) => {
      mutation.mutate(input);
    },
    own: toCall(mutation),
    last: calls.at(-1) ?? null,
  };
}

const refusalNotices: Readonly<Record<string, string>> = {
  MEMORY_ITEM_NOT_FOUND: 'This item is gone. It was forgotten after the list loaded.',
  STALE_VERSION:
    'This item changed after you opened it, so nothing was forgotten. Check it, then try again.',
};

function findRefusalNotice(error: unknown): string | null {
  if (error instanceof ORPCError && typeof error.code === 'string') {
    return refusalNotices[error.code] ?? null;
  }

  return null;
}

type CallState = Pick<MutationState, 'status' | 'variables' | 'error'>;

function toCall(state: CallState): MemoryForgetCall | null {
  const input = state.variables;

  if (state.status === 'idle' || !isForgetInput(input)) {
    return null;
  }

  if (state.status === 'error') {
    const notice = findRefusalNotice(state.error);

    return notice === null ? { status: 'failed', input } : { status: 'refused', input, notice };
  }

  return { status: state.status === 'success' ? 'applied' : 'pending', input };
}

function isForgetInput(value: unknown): value is MemoryForgetInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'clientActionID' in value &&
    'itemID' in value &&
    'version' in value
  );
}
