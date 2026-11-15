import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';
import type { DeferSettings } from './build-defer-times';

const fallback: DeferSettings = {
  defaultMinutes: 60,
  eveningAt: '18:00',
  morningAt: '08:00',
  zone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// The times a defer offers, as the host sets them. A card offers the fallback until they load.
export function useDeferSettings(): DeferSettings {
  const nixie = useNixieClient();
  const listed = useQuery(nixie.queryUtils.approvals.listItems.queryOptions());

  return listed.data?.defer ?? fallback;
}
