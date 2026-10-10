import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { getClient } from './get-client';
import { routeTree } from './routeTree.gen';

// Start calls getRouter once per server request and once in the browser, so no query cache or
// session crosses from one request to the next.
export function getRouter() {
  const client = getClient();
  const queryClient = new QueryClient();
  const router = createRouter({
    context: { client, queryClient, queryUtils: buildQueryUtils(client) },
    routeTree,
    scrollRestoration: true,
  });

  setupRouterSsrQueryIntegration({ queryClient, router });

  return router;
}
