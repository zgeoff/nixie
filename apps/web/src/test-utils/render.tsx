import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import { render as renderWithTestingLibrary } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildBrowserClient } from '../client/build-browser-client';
import { LiveProvider } from '../live/live-provider';
import { NixieClientContext } from '../utils/nixie-client-context';
import type { StartTimer } from '../utils/start-platform-timer';

interface ProvidersProps {
  readonly children: ReactNode;
}

export interface RenderOptions {
  // runs the live stream's reconnect delays and its fallback period
  readonly startTimer?: StartTimer;
}

export function render(ui: ReactNode, options: RenderOptions = {}): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const client = buildBrowserClient();
  const nixie = { client, queryUtils: buildQueryUtils(client) };

  return renderWithTestingLibrary(ui, {
    wrapper: (props: ProvidersProps) => (
      <QueryClientProvider client={queryClient}>
        <NixieClientContext value={nixie}>
          <LiveProvider
            {...(options.startTimer === undefined ? {} : { startTimer: options.startTimer })}
          >
            {props.children}
          </LiveProvider>
        </NixieClientContext>
      </QueryClientProvider>
    ),
  });
}
