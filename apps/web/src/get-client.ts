import { createIsomorphicFn } from '@tanstack/react-start';
import { buildBrowserClient } from './build-browser-client';
import { buildServerClient } from './build-server-client';
import { requireAPIURL } from './require-api-url';

// The Start compiler keeps one branch per bundle, so the browser bundle holds no server client,
// cookie handling or private URL.
export const getClient = createIsomorphicFn()
  .server(() => buildServerClient(requireAPIURL()))
  .client(() => buildBrowserClient());
