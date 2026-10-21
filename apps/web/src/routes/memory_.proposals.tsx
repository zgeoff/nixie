import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { MemoryProposals } from '../components/memory-proposals';
import { SignedInPage } from '../components/signed-in-page';
import { readSessionState } from '../read-session-state';
import { css } from '../styled-system/css';

export const Route = createFileRoute('/memory_/proposals')({
  component: Proposals,
  loader: async (options) => ({
    session: await readSessionState(() =>
      options.context.queryClient.query({
        ...options.context.queryUtils.memory.writerStatus.queryOptions(),
        staleTime: 'static',
      }),
    ),
  }),
});

function Proposals(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <MemoryProposals
        navigation={
          <Link className={link} to="/memory">
            Memory
          </Link>
        }
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
