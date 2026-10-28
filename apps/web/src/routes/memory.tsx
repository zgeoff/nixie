import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { MemoryView } from '../components/memory-view';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../read-route-session';
import { css } from '../styled-system/css';

interface MemorySearch {
  readonly item?: string;
}

export const Route = createFileRoute('/memory')({
  component: Memory,
  validateSearch: (search: Record<string, unknown>): MemorySearch =>
    typeof search['item'] === 'string' ? { item: search['item'] } : {},
  loader: (options) => readRouteSession(options.context),
});

function Memory(): ReactNode {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();

  return (
    <SignedInPage
      onRefresh={() => {
        void router.invalidate();
      }}
      session={data.session}
    >
      <MemoryView
        {...(search.item === undefined ? {} : { openItemID: search.item })}
        navigation={
          <nav className={css({ display: 'flex', gap: '3' })}>
            <Link className={link} to="/memory/proposals">
              Proposals
            </Link>
            <Link className={link} to="/moments">
              Moments
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
