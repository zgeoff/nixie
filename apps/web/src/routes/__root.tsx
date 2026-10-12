import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { NixieClientContext } from '../nixie-client-context';
import { css } from '../styled-system/css';
import styles from '../styles.css?url';
import type { RouterContext } from '../types';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootDocument,
  head: () => ({
    links: [{ href: styles, rel: 'stylesheet' }],
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
      <body className={css({ fontFamily: 'sans', lineHeight: 'relaxed' })}>
        <NixieClientContext value={{ client: context.client, queryUtils: context.queryUtils }}>
          <Outlet />
        </NixieClientContext>
        <Scripts />
      </body>
    </html>
  );
}
