import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import { render as renderWithTestingLibrary } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildBrowserClient } from '../build-browser-client';
import { NixieClientContext } from '../nixie-client-context';

// Renders a view inside the providers the web client gives it: the browser's oRPC client, and a
// fresh query cache per call with no retries, so a refused call shows at once.
export function render(ui: ReactNode): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = buildBrowserClient();

  return renderWithTestingLibrary(
    <QueryClientProvider client={queryClient}>
      <NixieClientContext value={{ client, queryUtils: buildQueryUtils(client) }}>
        {ui}
      </NixieClientContext>
    </QueryClientProvider>,
  );
}
