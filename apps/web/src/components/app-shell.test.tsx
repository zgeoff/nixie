import { expect, test } from 'bun:test';
import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import { buildBrowserClient } from '../client/build-browser-client';
import { NixieClientContext } from '../utils/nixie-client-context';
import { AppShell } from './app-shell';

async function setupTest() {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: createRootRoute({ component: () => <AppShell>{null}</AppShell> }),
  });

  await router.load();

  const client = buildBrowserClient();

  const queryClient = new QueryClient();

  return {
    renderServerMarkup: () =>
      renderToString(
        <QueryClientProvider client={queryClient}>
          <NixieClientContext value={{ client, queryUtils: buildQueryUtils(client) }}>
            <RouterProvider router={router} />
          </NixieClientContext>
        </QueryClientProvider>,
      ),
  };
}

test('it renders the Menu button disabled on the server, before React can take its tap', async () => {
  const ctx = await setupTest();

  expect(ctx.renderServerMarkup()).toMatch(/<button[^>]*aria-label="Menu"[^>]*disabled=""/u);
});
