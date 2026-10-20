// The release build: `bun apps/server/src/run-release-build.ts <outdir>` bundles the server and its
// SQLite worker, and exits 1 when the bundle holds a test-build ID, such as a fault point's or the
// test sandbox's, so neither the image build nor CI can ship a test build.
import { writeReleaseBundle } from './write-release-bundle';

const outdir = process.argv.at(2);

if (outdir === undefined) {
  process.stderr.write('usage: run-release-build.ts <outdir>\n');
  process.exit(2);
}

const bundle = await writeReleaseBundle(outdir);

if (bundle.testBuildIDs.length > 0) {
  process.stderr.write(
    `the release bundle holds test-build IDs: ${bundle.testBuildIDs.join(', ')}\n`,
  );

  process.exit(1);
}

process.stdout.write(
  `the release bundle holds ${bundle.files.join(', ')}, with no test-build ID\n`,
);
