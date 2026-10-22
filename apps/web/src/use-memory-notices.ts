import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { MemoryNotice } from './types';
import type { LiveRecord } from './use-live-records';
import { useNixieClient } from './use-nixie-client';

export function useMemoryNotices(
  thread: string,
  records: readonly LiveRecord[],
): readonly MemoryNotice[] {
  const nixie = useNixieClient();
  const newest = records.findLast((record) => record.kind.startsWith('memory.'))?.sequence ?? 0;
  const options = nixie.queryUtils.memory.listNotices.queryOptions({ input: { thread } });

  const notices = useQuery({
    ...options,
    queryKey: [...options.queryKey, newest],
    placeholderData: keepPreviousData,
  });

  return notices.data?.notices ?? [];
}
