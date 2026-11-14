import { tmpdir } from 'node:os';
import { createWebTransports } from './page/create-web-transports';
import { makeAddressCheck } from './page/make-address-check';
import { readPage } from './page/read-page';
import { resolveHostAddresses } from './page/resolve-host-addresses';
import { runFetcher } from './page/run-fetcher';
import { withFetchDirectory } from './page/with-fetch-directory';

await withFetchDirectory(tmpdir(), async (directory) => {
  process.chdir(directory);

  process.env['TMPDIR'] = directory;

  const transports = createWebTransports();

  await runFetcher(
    {
      input: Bun.stdin.stream(),
      write: async (bytes) => {
        await Bun.write(Bun.stdout, bytes);
      },
    },
    (request, askHop) =>
      readPage(request.url, {
        ...(askHop === undefined ? {} : { askHop }),
        limits: request.limits,
        checkAddress: makeAddressCheck(request.deniedRanges),
        resolveHost: resolveHostAddresses,
        transports,
      }),
  );
});
