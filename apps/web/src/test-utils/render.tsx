import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import { render as renderWithTestingLibrary } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildBrowserClient } from '../build-browser-client';
import { NixieClientContext } from '../nixie-client-context';

interface ProvidersProps {
  readonly children: ReactNode;
}

// Renders a view inside the providers the web client gives it: the browser's oRPC client, and a
// fresh query cache per call with no retries, so a refused call shows at once. A rerender keeps
// the providers and the cache, as a navigation between the app's pages does.
export function render(ui: ReactNode): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const client = buildBrowserClient();
  const nixie = { client, queryUtils: buildQueryUtils(client) };

  return renderWithTestingLibrary(ui, {
    wrapper: (props: ProvidersProps) => (
      <QueryClientProvider client={queryClient}>
        <NixieClientContext value={nixie}>{props.children}</NixieClientContext>
      </QueryClientProvider>
    ),
  });
}
