import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { NixieClientContext } from '../nixie-client-context';
import type { RouterContext } from '../types';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootDocument,
  head: () => ({
    meta: [
      { charSet: 'utf8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { title: 'nixie' },
    ],
  }),
});

function RootDocument(): ReactNode {
  const context = Route.useRouteContext();

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <NixieClientContext value={{ client: context.client, queryUtils: context.queryUtils }}>
          <Outlet />
        </NixieClientContext>
        <Scripts />
      </body>
    </html>
  );
}
