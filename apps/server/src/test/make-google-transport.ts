import { testGoogleHostSuffix } from './build-test-google-hosts';

// Sends each request to a Google test host to the fake site, with the same path and query. Any other
// request goes where its URL says, so the mock network answers it. With no site, all do.
export function makeGoogleTransport(
  siteURL: string | null,
): (url: string, init: RequestInit) => Promise<Response> {
  return (url, init) => {
    const target = new URL(url);

    if (siteURL === null || !target.hostname.endsWith(testGoogleHostSuffix)) {
      return fetch(url, init);
    }

    return fetch(`${siteURL}${target.pathname}${target.search}`, init);
  };
}
