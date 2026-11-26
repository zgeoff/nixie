// oxlint-disable zgeoff/file-named-for-export -- TanStack Router finds the root route by this file path

import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useLocation,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { CallGate } from '../call/call-gate';
import { AppShell } from '../components/app-shell';
import { DeviceFeedProvider } from '../device/device-feed-provider';
import { LiveProvider } from '../live/live-provider';
import { css } from '../styled-system/css';
import styles from '../styles.css?url';
import { buildThemeScript } from '../theme/build-theme-script';
import { themePalette } from '../theme/theme-palette';
import type { RouterContext } from '../types';
import { NixieClientContext } from '../utils/nixie-client-context';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootDocument,
  head: () => ({
    links: [
      { href: styles, rel: 'stylesheet' },
      { href: '/manifest.webmanifest', rel: 'manifest' },
    ],
    scripts: [{ children: buildThemeScript() }],
    meta: [
      { charSet: 'utf8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { content: themePalette.canvas.dark, name: 'theme-color' },
      { title: 'nixie' },
    ],
  }),
});

function RootDocument(): ReactNode {
  const context = Route.useRouteContext();
  const pathname = useLocation({ select: (location) => location.pathname });

  // The head script sets the theme attribute before React hydrates the page.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={css({ fontFamily: 'sans', lineHeight: 'relaxed' })}>
        <NixieClientContext value={{ client: context.client, queryUtils: context.queryUtils }}>
          <LiveProvider>
            <DeviceFeedProvider>
              <CallGate>
                {pathname === '/device' ? (
                  <Outlet />
                ) : (
                  <AppShell>
                    <Outlet />
                  </AppShell>
                )}
              </CallGate>
            </DeviceFeedProvider>
          </LiveProvider>
        </NixieClientContext>
        <Scripts />
      </body>
    </html>
  );
}
