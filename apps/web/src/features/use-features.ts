import type { FeatureID } from '@heynixie/contract';
import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';

// The features that are on in this nixie, or null until nixie.read answers. The read waits for a
// page to find the device signed in, so a signed-out visit makes no request and gets no answer.
export function useFeatures(): readonly FeatureID[] | null {
  const nixie = useNixieClient();

  const session = useQuery({
    ...nixie.queryUtils.sessions.list.queryOptions(),
    enabled: false,
    staleTime: 'static',
  });

  const read = useQuery({
    ...nixie.queryUtils.nixie.read.queryOptions(),
    enabled: session.isSuccess,
  });

  return read.data?.features ?? null;
}
