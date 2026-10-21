import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNixieClient } from '../use-nixie-client';
import { MemoryVersionList } from './memory-version-list';

export interface MemoryItemHistoryProps {
  readonly itemID: string;
}

export function MemoryItemHistory(props: MemoryItemHistoryProps): ReactNode {
  const nixie = useNixieClient();

  const detail = useQuery(
    nixie.queryUtils.memory.readItem.queryOptions({ input: { itemID: props.itemID } }),
  );

  if (detail.isPending) {
    return <p>Loading the history…</p>;
  }

  if (detail.isError) {
    return <p role="alert">The history did not load.</p>;
  }

  return <MemoryVersionList versions={detail.data.versions} />;
}
