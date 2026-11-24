import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderHookResult } from '@testing-library/react';
import { renderHook as renderHookWithTestingLibrary } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { buildBrowserClient } from '../client/build-browser-client';
import { LiveProvider } from '../live/live-provider';
import { NixieClientContext } from '../utils/nixie-client-context';
import type { StartTimer } from '../utils/start-platform-timer';

export interface RenderHookOptions {
  // runs the live stream's reconnect delays and its fallback period
  readonly startTimer?: StartTimer;
}

export function renderHook<Result>(
  hook: () => Result,
  options: RenderHookOptions = {},
): RenderHookResult<Result, unknown> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const client = buildBrowserClient();

  return renderHookWithTestingLibrary(hook, {
    wrapper: (props: Readonly<PropsWithChildren>) => (
      <QueryClientProvider client={queryClient}>
        <NixieClientContext value={{ client, queryUtils: buildQueryUtils(client) }}>
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
