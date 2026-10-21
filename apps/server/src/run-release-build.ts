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
