import { previewCheckout } from './preview-checkout';

// The folders of the preview image that hold the sources a journey runs.
export const servedSourceFolders = ['apps', 'libs', 'modules', 'guests', 'adapters', 'preview'];

// Git's blob id of each file in the running container, so the doctor compares it with this tree.
// The image leaves out `.git`, so the container cannot name its own commit. It runs in the
// container with `exec`, which leaves the running container as it is.
const listBlobs = `
const folders = ${JSON.stringify(servedSourceFolders)};
for (const folder of folders) {
  for await (const path of new Bun.Glob('**').scan({ cwd: '/app/' + folder, dot: true })) {
    if (path.split('/').includes('node_modules')) continue;
    const bytes = new Uint8Array(await Bun.file('/app/' + folder + '/' + path).arrayBuffer());
    const hasher = new Bun.CryptoHasher('sha1');
    hasher.update('blob ' + bytes.length + '\\0');
    hasher.update(bytes);
    console.log(hasher.digest('hex') + ' ' + folder + '/' + path);
  }
}
`;

export function buildServedBlobsArgv(): readonly string[] {
  return [
    'docker',
    'compose',
    '--file',
    `${previewCheckout}/preview/compose.yaml`,
    'exec',
    '-T',
    'nixie',
    'bun',
    '-e',
    listBlobs,
  ];
}
