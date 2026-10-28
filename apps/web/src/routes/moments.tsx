import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { MomentTimeline } from '../components/moment-timeline';
import { SignedInPage } from '../components/signed-in-page';
import { readSessionState } from '../read-session-state';
import { css } from '../styled-system/css';

export const Route = createFileRoute('/moments')({
  component: Moments,
  loader: async (options) => ({
    session: await readSessionState(() =>
      options.context.queryClient.query({
        ...options.context.queryUtils.memory.writerStatus.queryOptions(),
        staleTime: 'static',
      }),
    ),
  }),
});

function Moments(): ReactNode {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <MomentTimeline
        navigation={
          <nav className={css({ display: 'flex', gap: '3' })}>
            <Link className={link} to="/memory">
              Memory
            </Link>
            <Link className={link} to="/">
              Conversation
            </Link>
          </nav>
        }
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
