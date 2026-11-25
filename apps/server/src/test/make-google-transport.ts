import { testGoogleHostSuffix } from './build-test-google-hosts';
import type { GoogleAPISite } from './types';

// Sends each request to a Google test host to the fake site over HTTPS, with the same path and
// query. Any other request goes where its URL says, so the mock network answers it. With no site,
// all do.
export function makeGoogleTransport(
  site: GoogleAPISite | null,
): (url: string, init: RequestInit) => Promise<Response> {
  return (url, init) => {
    const target = new URL(url);

    if (site === null || !target.hostname.endsWith(testGoogleHostSuffix)) {
      return fetch(url, init);
    }

    return fetch(`${site.url}${target.pathname}${target.search}`, {
      ...init,
      tls: { ca: site.ca },
    });
  };
}
