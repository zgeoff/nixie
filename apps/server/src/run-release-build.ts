// The release build: `bun apps/server/src/run-release-build.ts <outdir>` bundles the server into
// main.js and its SQLite worker into sqlite-worker.js, and exits 1 when the bundle holds a fault point ID or the test rule's ID, so neither the
// image build nor CI can ship a test build.
import { buildReleaseBundle } from './build-release-bundle';

const outdir = process.argv.at(2);

if (outdir === undefined) {
  process.stderr.write('usage: run-release-build.ts <outdir>\n');
  process.exit(2);
}

const bundle = await buildReleaseBundle(outdir);

if (bundle.testBuildIDs.length > 0) {
  process.stderr.write(
    `the release bundle holds test-build IDs: ${bundle.testBuildIDs.join(', ')}\n`,
  );

  process.exit(1);
}

process.stdout.write(
  `the release bundle holds ${bundle.files.join(', ')}, with no test-build ID\n`,
);
