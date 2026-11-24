import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLiveUnavailable } from '../live/use-live-unavailable';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { DefinitionRow } from './definition-row';

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const notice = css({ color: 'textMuted', fontSize: 'sm' });
const list = css({ display: 'flex', flexDirection: 'column', gap: '4' });

export function DefinitionList(): ReactNode {
  const nixie = useNixieClient();
  const isUnavailable = useLiveUnavailable();
  const listed = useQuery(nixie.queryUtils.definitions.listTasks.queryOptions());
  const definitions = listed.data?.definitions ?? [];

  return (
    <main className={page}>
      <h1>Definitions</h1>
      {isUnavailable ? (
        <p className={notice} role="status">
          Live updates unavailable
        </p>
      ) : null}
      {listed.isPending ? <p>Loading the definitions…</p> : null}
      {listed.isError ? (
        <p role="alert">
          The definitions did not load.{' '}
          <button
            onClick={() => {
              void listed.refetch();
            }}
            type="button"
          >
            Load them again
          </button>
        </p>
      ) : null}
      {listed.isSuccess && definitions.length === 0 ? (
        <p className={notice}>No task has a definition.</p>
      ) : null}
      <ul className={list}>
        {definitions.map((definition) => (
          <DefinitionRow definition={definition} key={definition.definitionID} />
        ))}
      </ul>
    </main>
  );
}
