// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ApprovalDigest } from '../approval/approval-digest';
import { SignedInPage } from '../components/signed-in-page';
import { readRouteSession } from '../conversation/read-route-session';
import { css } from '../styled-system/css';

interface ProposalsSearch {
  readonly proposal?: string;
}

export const Route = createFileRoute('/proposals')({
  component: Approvals,
  validateSearch: (search: Record<string, unknown>): ProposalsSearch =>
    typeof search['proposal'] === 'string' ? { proposal: search['proposal'] } : {},
  loader: (options) => readRouteSession(options.context),
});

function Approvals(): ReactNode {
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
      <ApprovalDigest
        {...(search.proposal === undefined ? {} : { openProposalID: search.proposal })}
        navigation={
          <Link className={link} to="/mandates">
            Mandates
          </Link>
        }
      />
    </SignedInPage>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });
