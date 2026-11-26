import { expect, test } from 'bun:test';
import { useQuery } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { useNixieClient } from '../utils/use-nixie-client';
import { CallProvider } from './call-provider';
import { useCallApprovals } from './use-call-approvals';

function setupTest() {
  const rootRoute = createRootRoute({
    component: () => (
      <CallProvider>
        <Outlet />
      </CallProvider>
    ),
  });

  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/call',
      component: (): ReactNode => {
        const approvals = useCallApprovals('t1');

        return (
          <ul aria-label="Cards">
            {approvals.items.map((item) => (
              <li key={item.proposal.proposalID}>
                {`${item.proposal.shortID} is ${item.proposal.state}`}
              </li>
            ))}
          </ul>
        );
      },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/elsewhere',
      component: (): ReactNode => {
        const nixie = useNixieClient();
        const listed = useQuery(nixie.queryUtils.approvals.listItems.queryOptions());

        // a page that keeps the list of open items fresh, so the list the call screen reads on
        // return no longer holds a proposal that settled
        return (
          <div>
            <p>{`Open items: ${listed.data?.items.length ?? 'unknown'}`}</p>
            <button type="button" onClick={() => void listed.refetch()}>
              Refresh
            </button>
          </div>
        );
      },
    }),
  ]);

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/call'] }),
    routeTree,
  });

  return { router, mount: () => render(<RouterProvider router={router} />) };
}

test('#useCallApprovals keeps a card that settled while the user was on another page, once the user returns to the call screen', async () => {
  await createDeviceSession();

  const ctx = setupTest();

  const row = await store.approvalRows.create({ shortID: 'k3x9m2p7qa', thread: 't1' });

  const rendered = ctx.mount();

  await rendered.findByText('k3x9m2p7qa is pending');

  act(() => {
    ctx.router.history.push('/elsewhere');
  });

  await rendered.findByText('Open items: 1');

  await store.approvalRows.update(row, {
    data: (draft) => {
      draft.state = 'declined';
    },
  });

  fireEvent.click(rendered.getByText('Refresh'));

  await rendered.findByText('Open items: 0');

  act(() => {
    ctx.router.history.push('/call');
  });

  const card = await rendered.findByText('k3x9m2p7qa is declined');

  expect(card).toBeTruthy();
});
