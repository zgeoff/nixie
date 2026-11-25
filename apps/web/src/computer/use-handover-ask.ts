import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';

// The assistant's standing ask for a take-over. The read gives the ask that stands, and the live
// stream's `computer` topic reads it again when a take-over starts or the ask closes.
export function useHandoverAsk() {
  const nixie = useNixieClient();

  const read = useQuery({
    ...nixie.queryUtils.computer.readHandover.queryOptions(),
    refetchOnWindowFocus: 'always',
  });

  return read.data?.ask ?? null;
}
