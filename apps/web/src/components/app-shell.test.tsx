import { expect, test } from 'bun:test';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import { AppShell } from './app-shell';

async function setupTest() {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: createRootRoute({ component: () => <AppShell>{null}</AppShell> }),
  });

  await router.load();

  return { renderServerMarkup: () => renderToString(<RouterProvider router={router} />) };
}

test('it renders the Menu button disabled on the server, before React can take its tap', async () => {
  const ctx = await setupTest();

  expect(ctx.renderServerMarkup()).toMatch(/<button[^>]*aria-label="Menu"[^>]*disabled=""/u);
});
