import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';

// A pause that another device or the host starts reaches this client within one interval, or at
// once when the window gains focus.
const refetchIntervalMs = 15_000;

export function usePauseState() {
  const nixie = useNixieClient();

  return useQuery({
    ...nixie.queryUtils.nixie.read.queryOptions(),
    refetchInterval: refetchIntervalMs,
  });
}
