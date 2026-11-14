// The images leave out `.git`, so a running container cannot name its commit: the verify CLI's
// preview doctor compares these blob ids with the commit instead. It runs on Bun alone in an
// image, so it imports nothing.
const sourceFolders = ['apps', 'libs', 'modules', 'guests', 'adapters', 'preview'];

const skippedSegments = new Set(['node_modules', 'dist']);

export async function writeSourceBlobs(root: string): Promise<void> {
  for (const folder of sourceFolders) {
    const scan = new Bun.Glob('**').scan({ cwd: `${root}/${folder}`, dot: true, onlyFiles: true });

    for await (const path of scan) {
      if (path.split('/').some((segment) => skippedSegments.has(segment))) {
        continue;
      }

      const bytes = await Bun.file(`${root}/${folder}/${path}`).bytes();

      const hasher = new Bun.CryptoHasher('sha1');

      hasher.update(`blob ${bytes.length}\0`);
      hasher.update(bytes);
      console.log(`${hasher.digest('hex')} ${folder}/${path}`);
    }
  }
}

if (import.meta.main) {
  await writeSourceBlobs(process.argv[2] ?? '.');
}
