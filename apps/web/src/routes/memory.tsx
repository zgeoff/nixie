import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { MemoryView } from '../components/memory-view';
import { SignedInPage } from '../components/signed-in-page';
import { readSessionState } from '../read-session-state';
import { css } from '../styled-system/css';

// The memory view. Its first read is the writer's status, which any signed-in device reads.
export const Route = createFileRoute('/memory')({
  component: Memory,
  loader: async (options) => ({
    session: await readSessionState(() =>
      options.context.queryClient.query({
        ...options.context.queryUtils.memory.writerStatus.queryOptions(),
        staleTime: 'static',
      }),
    ),
  }),
});

function Memory(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <MemoryView
        navigation={
          <Link className={css({ color: 'link', textDecoration: 'underline' })} to="/">
            Conversation
          </Link>
        }
      />
    </SignedInPage>
  );
}
