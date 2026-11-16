import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useFollowViewRecords } from '../task/use-follow-view-records';
import type { StartTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { DefinitionRow } from './definition-row';

export interface DefinitionListProps {
  readonly startTimer?: StartTimer;
}

const followedKinds: ReadonlySet<string> = new Set(['definition.changed']);

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

export function DefinitionList(props: DefinitionListProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const followed = useFollowViewRecords({
    kinds: followedKinds,
    onChange: () => {
      void queryClient.invalidateQueries({
        queryKey: nixie.queryUtils.definitions.listTasks.key(),
      });
    },
    ...(props.startTimer === undefined ? {} : { startTimer: props.startTimer }),
  });

  const listed = useQuery(nixie.queryUtils.definitions.listTasks.queryOptions());
  const definitions = listed.data?.definitions ?? [];

  return (
    <main className={page}>
      <h1>Definitions</h1>
      {followed.unavailable ? (
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
