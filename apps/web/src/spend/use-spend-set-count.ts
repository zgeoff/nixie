import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SpendSetCountInput } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';

export function useSpendSetCount() {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SpendSetCountInput) => nixie.client.spend.setCount(input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.spend.key() });
      void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.nixie.key() });
      void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.tasks.key() });
    },
  });
}
