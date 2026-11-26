import type { FeatureID } from '@heynixie/contract';
import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';

// The features that are on in this nixie, or null until nixie.read answers: a signed-out visit
// never gets an answer, and a signed-in page gets it through the same read that the pause banner
// makes.
export function useFeatures(): readonly FeatureID[] | null {
  const nixie = useNixieClient();
  const read = useQuery(nixie.queryUtils.nixie.read.queryOptions());

  return read.data?.features ?? null;
}
