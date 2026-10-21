import { tmpdir } from 'node:os';
import { makeAddressCheck } from './make-address-check';
import { readPage } from './read-page';
import { resolveHostAddresses } from './resolve-host-addresses';
import { runFetcher } from './run-fetcher';
import { withFetchDirectory } from './with-fetch-directory';

await withFetchDirectory(tmpdir(), async (directory) => {
  process.chdir(directory);

  process.env['TMPDIR'] = directory;

  await runFetcher(
    {
      input: Bun.stdin.stream(),
      write: async (bytes) => {
        await Bun.write(Bun.stdout, bytes);
      },
    },
    (request) =>
      readPage(request.url, {
        limits: request.limits,
        checkAddress: makeAddressCheck(request.deniedRanges),
        resolveHost: resolveHostAddresses,
      }),
  );
});
