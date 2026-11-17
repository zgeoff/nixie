import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';

// A stop that the watcher trips or clears reaches this client within one interval.
const refetchIntervalMs = 15_000;

export function useSpendStop() {
  const nixie = useNixieClient();

  return useQuery({
    ...nixie.queryUtils.spend.read.queryOptions(),
    refetchInterval: refetchIntervalMs,
  });
}
