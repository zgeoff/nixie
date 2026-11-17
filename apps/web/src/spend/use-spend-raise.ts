import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SpendRaiseInput } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';

export function useSpendRaise() {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SpendRaiseInput) => nixie.client.spend.raise(input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.spend.key() });
      void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.nixie.key() });
      void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.tasks.key() });
    },
  });
}
