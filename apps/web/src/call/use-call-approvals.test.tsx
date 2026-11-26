import { expect, test } from 'bun:test';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
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
      component: () => <p>Another page</p>,
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

  await rendered.findByText('Another page');

  await store.approvalRows.update(row, {
    data: (draft) => {
      draft.state = 'declined';
    },
  });

  act(() => {
    ctx.router.history.push('/call');
  });

  const card = await rendered.findByText('k3x9m2p7qa is declined');

  expect(card).toBeTruthy();
});
