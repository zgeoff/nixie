import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import type { RenderResult, queries } from '@testing-library/react';
import { render } from '@testing-library/react';
import { buildBrowserClient } from '../build-browser-client';
import { routeTree } from '../routeTree.gen';

// The root route renders the whole document, so the route renders into the document itself.
export function renderRoute(path: string): RenderResult<typeof queries, Document, HTMLElement> {
  const client = buildBrowserClient();

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const router = createRouter({
    context: { client, queryClient, queryUtils: buildQueryUtils(client) },
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
    { baseElement: document.body, container: document },
  );
}
