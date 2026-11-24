import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

const notice = css({
  borderBlockEnd: '1px solid',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 'sm',
  gap: '2',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

// nixie retries a stuck forget every 30 seconds, so a read each 30 seconds shows when one clears.
const refetchIntervalMs = 30_000;
const msPerMinute = 60_000;

export function ForgetStuckNotice(): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const read = useQuery({
    ...nixie.queryUtils.erasure.readStuck.queryOptions(),
    refetchInterval: refetchIntervalMs,
  });

  const retry = useMutation({
    mutationFn: () => nixie.client.erasure.retryStuck(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.erasure.key() });
    },
  });

  const stuck = read.data?.stuck ?? [];

  if (stuck.length === 0) {
    return null;
  }

  return (
    <section aria-label="A forget is stuck" className={notice}>
      <p role="alert">
        A forget is stuck: it hid what you chose to forget, but a step of its cleanup keeps failing,
        so some of that data may remain. nixie tries again every 30 seconds.
      </p>
      <ul
        aria-label="Stuck forgets"
        className={css({ listStyleType: 'disc', paddingInlineStart: '5' })}
      >
        {stuck.map((forget, index) => (
          <li key={`${forget.kind}/${forget.shortID ?? ''}/${String(index)}`}>
            A {forget.kind}
            {forget.shortID === null ? '' : ` (${forget.shortID})`}, open for{' '}
            {Math.floor(forget.openForMs / msPerMinute)} min
          </li>
        ))}
      </ul>
      <div>
        <button
          disabled={retry.isPending}
          onClick={() => {
            retry.mutate();
          }}
          type="button"
        >
          Retry the forget now
        </button>
      </div>
      {retry.isError ? <p role="alert">The retry did not finish. Try again.</p> : null}
    </section>
  );
}
