import { match } from 'ts-pattern';
import { previewCheckout } from './preview-checkout';

// The folders `preview/write-source-blobs.ts` lists, which hold the sources a journey runs.
export const servedSourceFolders = ['apps', 'libs', 'modules', 'guests', 'adapters', 'preview'];

export type ServedContainer = 'nixie' | 'web';

// The argv that prints git's blob id of each source file a running container was built from. The
// nixie image holds the sources, so the lister runs there. The web image keeps only its build, so
// its build writes the list into the image. `exec` leaves the running container as it is.
export function buildServedBlobsArgv(container: ServedContainer): readonly string[] {
  const exec = [
    'docker',
    'compose',
    '--file',
    `${previewCheckout}/preview/compose.yaml`,
    'exec',
    '-T',
  ];

  return match(container)
    .with('nixie', () => [...exec, 'nixie', 'bun', '/app/preview/write-source-blobs.ts', '/app'])
    .with('web', () => [...exec, 'web', 'cat', '/app/source-blobs.txt'])
    .exhaustive();
}
