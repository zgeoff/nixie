import { tmpdir } from 'node:os';
import { makeAddressCheck, resolveHostAddresses } from '@heynixie/egress';
import { createWebTransports } from './page/create-web-transports';
import { readHTML } from './page/read-html';
import { readPage } from './page/read-page';
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
      request.html === undefined
        ? readPage(request.url, {
            ...(askHop === undefined ? {} : { askHop }),
            limits: request.limits,
            ...(request.mode === undefined ? {} : { mode: request.mode }),
            checkAddress: makeAddressCheck(request.deniedRanges),
            resolveHost: resolveHostAddresses,
            transports,
          })
        : Promise.resolve(readHTML(request.html, request.url, request.limits)),
  );
});
