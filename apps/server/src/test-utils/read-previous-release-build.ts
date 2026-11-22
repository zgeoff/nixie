import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readTestTemplate } from '@heynixie/testing';
import { $ } from 'bun';
import { z } from 'zod';
import { readPreviousReleaseTag } from './read-previous-release-tag';

interface PreviousReleaseTimes {
  readonly checkoutMs: number;
  readonly installMs: number;
  readonly buildMs: number;
}

export interface PreviousReleaseBuild {
  readonly tag: string;
  readonly entry: string;

  // The release's test build. It holds the test sandbox and the doubles, so it runs every part of
  // a start on a test build's data, where the release build stops at the parts that need an impd.
  readonly testEntry: string;

  // The sandbox image keys of the release's own tuple at its tag. The release refuses a manifest
  // key it does not know, and a deployment rolls back with that release's own manifest.
  readonly imageKeys: readonly string[];

  // null when an earlier run built it, so the three phases did not run
  readonly times: PreviousReleaseTimes | null;
}

const sourceRoot = join(import.meta.dir, '..', '..', '..', '..');

interface PreviousReleaseBuildLocation {
  // the git repository whose tags and objects the build reads
  readonly repoRoot: string;

  // the folder that holds the cached builds
  readonly parentDir: string;
}

const defaultLocation: PreviousReleaseBuildLocation = {
  repoRoot: sourceRoot,
  parentDir: join(sourceRoot, 'node_modules', '.cache', 'nixie-test-bundles'),
};

const imageKeysFile = 'sandbox-image-keys.json';
const imageKeysSchema = z.array(z.string()).min(1);

// A tag never changes, so the tag keys the build. The hash input is this file, so a change to the
// build steps builds again.
export async function readPreviousReleaseBuild(
  location: PreviousReleaseBuildLocation = defaultLocation,
): Promise<PreviousReleaseBuild> {
  const tag = await readPreviousReleaseTag(location.repoRoot);

  const state: { times: PreviousReleaseTimes | null } = { times: null };

  const directory = await readTestTemplate({
    name: `nixie-previous-release-${tag}`,
    checkout: location.parentDir,
    root: sourceRoot,
    inputs: ['apps/server/src/test-utils/read-previous-release-build.ts'],
    write: async (building) => {
      state.times = await writeBuildOfTag(location, tag, join(building, 'out'));
    },
  });

  const keysJSON: unknown = await Bun.file(join(directory, 'out', imageKeysFile)).json();

  const imageKeys = imageKeysSchema.parse(keysJSON);

  return {
    tag,
    entry: join(directory, 'out', 'main.js'),
    testEntry: join(directory, 'out', 'test', 'main.js'),
    imageKeys,
    times: state.times,
  };
}

// A test build runs each guest from the source path it was built at, so the checkout stays at a
// path that no rename moves, and holds no git registration that a later build must remove.
async function writeBuildOfTag(
  location: PreviousReleaseBuildLocation,
  tag: string,
  outdir: string,
): Promise<PreviousReleaseTimes> {
  const checkout = join(location.parentDir, `nixie-previous-release-${tag}-source`);

  await removeCheckouts(location.parentDir);
  await mkdir(checkout, { recursive: true });

  try {
    return await writeBuildOfCheckout(location.repoRoot, { tag, checkout, outdir });
  } catch (error) {
    await rm(checkout, { recursive: true, force: true });

    throw error;
  }
}

// One checkout at a time: a new build takes the place of the checkout of any earlier tag.
async function removeCheckouts(parentDir: string): Promise<void> {
  await mkdir(parentDir, { recursive: true });

  const entries = await readdir(parentDir);

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith('nixie-previous-release-') && entry.endsWith('-source'))
      .map((entry) => rm(join(parentDir, entry), { recursive: true, force: true })),
  );
}

interface CheckoutBuild {
  readonly tag: string;
  readonly checkout: string;
  readonly outdir: string;
}

// The release's own bundle writer, run by its own Bun in its checkout, with the test build on.
const writeTestBuild =
  "const { writeReleaseBundle } = await import('./apps/server/src/release/write-release-bundle.ts'); " +
  'await writeReleaseBundle(process.env.NIXIE_TEST_BUILD_OUTDIR, true);';

// The release's own tuple, printed by the release's own Bun in its checkout, because the tuple's
// file imports nothing and a release script loads it the same way.
const printImageKeys =
  "import { sandboxImageKeys } from './modules/sandbox/src/sandbox/sandbox-image-keys.ts'; " +
  'process.stdout.write(JSON.stringify(sandboxImageKeys));';

const timesSchema = z.object({
  checkoutMs: z.number(),
  installMs: z.number(),
  buildMs: z.number(),
});

async function writeBuildOfCheckout(
  repoRoot: string,
  build: CheckoutBuild,
): Promise<PreviousReleaseTimes> {
  const checkout = build.checkout;
  const outdir = build.outdir;

  const checkoutMs = await timePhase(() =>
    $`git archive --format=tar ${build.tag} | tar -x -C ${checkout}`.cwd(repoRoot).quiet(),
  );

  const installMs = await timePhase(() =>
    $`${process.execPath} install --frozen-lockfile --ignore-scripts`.cwd(checkout).quiet(),
  );

  await mkdir(outdir, { recursive: true });

  const buildMs = await timePhase(async () => {
    await $`${process.execPath} apps/server/src/run-release-build.ts ${outdir}`
      .cwd(checkout)
      .quiet();

    await $`${process.execPath} --eval ${writeTestBuild}`
      .cwd(checkout)
      .env({ ...process.env, NIXIE_TEST_BUILD_OUTDIR: join(outdir, 'test') })
      .quiet();
  });

  const keysText = await $`${process.execPath} --eval ${printImageKeys}`.cwd(checkout).text();

  const keys = imageKeysSchema.parse(JSON.parse(keysText));

  await Bun.write(join(outdir, imageKeysFile), JSON.stringify(keys));

  return timesSchema.parse({ checkoutMs, installMs, buildMs });
}

async function timePhase(run: () => PromiseLike<unknown>): Promise<number> {
  const start = performance.now();

  await run();

  return performance.now() - start;
}
