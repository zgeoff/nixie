import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderHookResult } from '@testing-library/react';
import { renderHook as renderHookWithTestingLibrary } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { buildBrowserClient } from '../build-browser-client';
import { NixieClientContext } from '../nixie-client-context';

// Renders a hook inside the providers the web client gives it, as render does for a view.
export function renderHook<Result>(hook: () => Result): RenderHookResult<Result, unknown> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const client = buildBrowserClient();

  return renderHookWithTestingLibrary(hook, {
    wrapper: (props: Readonly<PropsWithChildren>) => (
      <QueryClientProvider client={queryClient}>
        <NixieClientContext value={{ client, queryUtils: buildQueryUtils(client) }}>
          {props.children}
        </NixieClientContext>
      </QueryClientProvider>
    ),
  });
}
