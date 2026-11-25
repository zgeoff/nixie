import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';

// The gateway counts each reply as it arrives and no live topic says so, so the page reads again on
// a short interval. A trip or a raise invalidates the spend queries, which reads it at once.
const refetchIntervalMs = 15_000;

export function useSpendCounts() {
  const nixie = useNixieClient();

  return useQuery({
    ...nixie.queryUtils.spend.counts.queryOptions(),
    refetchInterval: refetchIntervalMs,
  });
}
