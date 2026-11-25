import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';

// A pause that another device or the host starts reaches this read through the live stream's
// `nixie` topic.
export function usePauseState() {
  const nixie = useNixieClient();

  return useQuery(nixie.queryUtils.nixie.read.queryOptions());
}
