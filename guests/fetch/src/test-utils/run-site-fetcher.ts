import { createWebTransports } from '../page/create-web-transports';
import { readPage } from '../page/read-page';
import { runFetcher } from '../page/run-fetcher';

// The fetcher with the real page reader, for a test sandbox: every request goes to the plain-http
// loopback site that the first argument names, with that site's port and the URL's own host and
// path.
const [siteURL] = Bun.argv.slice(2);

await runFetcher(
  {
    input: Bun.stdin.stream(),
    write: async (bytes) => {
      await Bun.write(Bun.stdout, bytes);
    },
  },
  (request, askHop) => {
    if (siteURL === undefined) {
      return Promise.resolve({
        kind: 'failed',
        reason: 'the site fetcher has no test site',
        isGated: false,
      });
    }

    const asked = new URL(request.url);
    const site = new URL(`${asked.pathname}${asked.search}`, siteURL);

    return readPage(`http://${asked.hostname}:${site.port}${site.pathname}${site.search}`, {
      ...(askHop === undefined ? {} : { askHop }),
      limits: request.limits,
      ...(request.mode === undefined ? {} : { mode: request.mode }),
      checkAddress: (address) => address === '127.0.0.1',
      resolveHost: () => Promise.resolve(['127.0.0.1']),
      transports: createWebTransports(),
    });
  },
);
