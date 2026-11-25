import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';

// A stop that the watcher trips or clears reaches this read through the live stream's `spend`
// topic.
export function useSpendStop() {
  const nixie = useNixieClient();

  return useQuery(nixie.queryUtils.spend.read.queryOptions());
}
