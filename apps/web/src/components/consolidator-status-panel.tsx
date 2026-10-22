import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';

export function ConsolidatorStatusPanel(): ReactNode {
  const nixie = useNixieClient();
  const status = useQuery(nixie.queryUtils.memory.consolidatorStatus.queryOptions());

  if (status.isPending || status.isError || status.data.isEnabled) {
    return null;
  }

  return (
    <section
      aria-label="Memory consolidation"
      className={css({ fontSize: 'sm', marginBlock: '3' })}
    >
      <p>Memory consolidation: off</p>
    </section>
  );
}
