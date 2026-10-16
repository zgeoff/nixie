import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter(): ReturnType<typeof createRouter> {
  return createRouter({ context: { queryClient: new QueryClient() }, routeTree });
}
