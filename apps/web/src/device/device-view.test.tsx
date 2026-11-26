import { expect, onTestFinished, test } from 'bun:test';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import invariant from 'tiny-invariant';
import { AppShell } from '../components/app-shell';
import { SignedInPage } from '../components/signed-in-page';
import { deviceStore } from '../mocks/device-store';
import { mockLive } from '../mocks/mock-live';
import { createDeviceSession } from '../test-utils/create-device-session';
import { registerStubResizeObserver } from '../test-utils/register-stub-resize-observer';
import { render } from '../test-utils/render';
import { DeviceView } from './device-view';

function setupTest() {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  });

  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <SignedInPage onRefresh={() => {}} session="live">
          <p>The conversation</p>
        </SignedInPage>
      ),
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/device-view',
      component: () => (
        <SignedInPage onRefresh={() => {}} session="live">
          <DeviceView />
        </SignedInPage>
      ),
    }),
  ]);

  const mount = (path: string) => {
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: [path] }),
      routeTree,
    });

    return render(<RouterProvider router={router} />);
  };

  return { mount, user: userEvent.setup() };
}

test('it opens from the menu link and draws what the device stream holds', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = ctx.mount('/');

  const links = await rendered.findAllByRole('link', { name: 'Device view' });

  const link = links.at(0);

  invariant(link, 'the menu has a Device view link');

  await ctx.user.click(link);

  const heading = await rendered.findByRole('heading', { name: 'Saturday' });

  expect(heading).toBeVisible();
});

test('it draws the layout that the device holds when a region shows content', async () => {
  const ctx = setupTest();

  deviceStore.layoutHolder.layout = {
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [
      {
        name: 'note',
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: null,
        content: { kind: 'markdown', markdown: 'Bins go out tonight' },
        shown: null,
        until: null,
      },
    ],
  };

  await createDeviceSession();

  const rendered = ctx.mount('/device-view');

  const note = await rendered.findByText('Bins go out tonight');

  expect(note).toBeVisible();
});

test('it shows no pop-up, badge or notice on another page when the device content changes', async () => {
  const ctx = setupTest();

  deviceStore.layoutHolder.layout = {
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [
      {
        name: 'note',
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: null,
        content: { kind: 'markdown', markdown: 'Bins go out tonight' },
        shown: null,
        until: null,
      },
    ],
  };

  await createDeviceSession();

  const rendered = ctx.mount('/');

  const page = await rendered.findByText('The conversation');

  await waitFor(() => {
    expect(mockLive.openCount).toBe(2);
  });

  expect([
    page,
    rendered.queryByRole('alert'),
    rendered.queryByRole('status'),
    rendered.queryByRole('dialog', { name: /device/iu }),
    rendered.queryByText('Bins go out tonight'),
  ]).toStrictEqual([page, null, null, null, null]);
});

test('it reports the new size of the page area to the device when the area changes', async () => {
  const observer = registerStubResizeObserver();
  const original = Element.prototype.getBoundingClientRect;
  const size = { width: 900, height: 500 };

  Element.prototype.getBoundingClientRect = () => new DOMRect(0, 0, size.width, size.height);

  onTestFinished(() => {
    Element.prototype.getBoundingClientRect = original;
  });

  const ctx = setupTest();

  await createDeviceSession();

  const rendered = ctx.mount('/device-view');

  const area = await rendered.findByRole('region', { name: 'Device view' });

  await waitFor(() => {
    expect(mockLive.openCount).toBe(2);
  });

  await rendered.findByRole('heading', { name: 'Saturday' });

  size.width = 1000;
  size.height = 600;

  observer.resize(area);

  await waitFor(() => {
    expect(deviceStore.resizes.findMany().length).toBeGreaterThan(0);
  });

  const last = deviceStore.resizes.findMany().at(-1);

  expect(last).toMatchObject({
    width: Math.round(1000 * globalThis.devicePixelRatio),
    height: Math.round(600 * globalThis.devicePixelRatio),
  });
});
