import { expect, onTestFinished, test } from 'bun:test';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

// The release path builds the package in place, so each test builds a copy of it in its own temp
// folder. A parallel test of another package then never reads a package.json that the build has
// rewritten.
function setupTest(packageDir: string, name: string) {
  const repoPath = join(import.meta.dir, '../..');
  const backupDigest = `sha256:${'4'.repeat(64)}`;
  const directory = mkdtempSync(join(tmpdir(), 'nixie-publish-npm-package-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const workPath = join(directory, 'repo');
  const stubPath = join(directory, 'stub');
  const binPath = join(directory, 'bin');

  mkdirSync(workPath);
  mkdirSync(join(stubPath, 'published'), { recursive: true });
  mkdirSync(binPath);

  // the files that a package's build reads from the repo root
  const rootFiles = [
    'bun.lock',
    'tsconfig.base.json',
    'nixie-test-build.d.ts',
    'bun-serve-options.d.ts',
    'guests/conversation/src/nixie-cli-path.d.ts',
  ];

  for (const file of rootFiles) {
    cpSync(join(repoPath, file), join(workPath, file));
  }

  // The copy holds one workspace, and bun 1.4.4 fails a pack when the root package.json lists a
  // workspace folder that is absent, so the copy's root lists only the package under test. The
  // catalog stays, because the pack resolves each catalog: version from it.
  const rootManifest = JSON.parse(readFileSync(join(repoPath, 'package.json'), 'utf8'));

  rootManifest.workspaces.packages = [packageDir];

  writeFileSync(join(workPath, 'package.json'), `${JSON.stringify(rootManifest, null, 2)}\n`);

  cpSync(join(repoPath, packageDir), join(workPath, packageDir), {
    recursive: true,
    filter: (source) => !source.endsWith('/node_modules'),
  });

  symlinkSync(join(repoPath, 'node_modules'), join(workPath, 'node_modules'));

  symlinkSync(
    join(repoPath, packageDir, 'node_modules'),
    join(workPath, packageDir, 'node_modules'),
  );

  // stands in for npm: records each view and publish in calls.log, answers a view of the package's
  // name with that name unless NO_PACKAGE is set, answers a view of the PUBLISHED version with that
  // version, fails any other view with npm's 404, and keeps each published tarball
  writeFileSync(
    join(binPath, 'npm'),
    `#!/usr/bin/env bash
if [[ $1 == view ]]; then
  printf 'view %s\\n' "\${*:2}" >> "$STUB_DIR/calls.log"
  if [[ -n \${NO_PACKAGE:-} ]]; then
    echo "npm error code E404" >&2
    exit 1
  fi
  if [[ $3 == name ]]; then
    echo "$2"
    exit 0
  fi
  if [[ -n \${PUBLISHED:-} && $2 == *"@$PUBLISHED" ]]; then
    echo "$PUBLISHED"
    exit 0
  fi
  echo "npm error code E404" >&2
  exit 1
fi
if [[ $1 == publish ]]; then
  printf 'publish %s %s\\n' "$(basename "$2")" "\${*:3}" >> "$STUB_DIR/calls.log"
  cp "$2" "$STUB_DIR/published/"
  exit 0
fi
echo "the npm stand-in has no answer for: $*" >&2
exit 1
`,
  );

  chmodSync(join(binPath, 'npm'), 0o755);

  const packageJsonPath = join(workPath, packageDir, 'package.json');
  const packageJson = readFileSync(packageJsonPath, 'utf8');

  const runPublish = async (env: Readonly<Record<string, string>>) => {
    const result =
      await $`bash ${join(import.meta.dir, 'publish-npm-package.sh')} ${packageDir} 1.2.3`
        .cwd(workPath)
        .env({
          ...process.env,
          PATH: `${binPath}:${process.env['PATH'] ?? ''}`,
          STUB_DIR: stubPath,
          BACKUP_IMAGE: `ghcr.io/example/nixie-backup@${backupDigest}`,
          ...env,
        })
        .nothrow()
        .quiet();

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      calls: existsSync(join(stubPath, 'calls.log'))
        ? readFileSync(join(stubPath, 'calls.log'), 'utf8')
        : '',
      published: readdirSync(join(stubPath, 'published')),
      packageJson: readFileSync(packageJsonPath, 'utf8'),
    };
  };

  // reads one file out of the tarball that the stand-in for npm kept
  const readPublished = (tarball: string, file: string) =>
    $`tar -xzOf ${join(stubPath, 'published', tarball)} ${file}`.text();

  return { name, packageJson, workPath, backupDigest, runPublish, readPublished };
}

test.each([
  ['libs/contract', '@heynixie/contract', 'heynixie-contract-1.2.3.tgz'],
  ['deploy/pulumi-k8s', '@heynixie/pulumi-k8s', 'heynixie-pulumi-k8s-1.2.3.tgz'],
])('it publishes nothing and warns when npm holds no %s', async (packageDir, name) => {
  const ctx = setupTest(packageDir, name);

  const result = await ctx.runPublish({ NO_PACKAGE: '1' });

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: `::warning::npm holds no ${ctx.name} yet, so the release publishes nothing. Create the package on npm and add this workflow as its trusted publisher.\n`,
    calls: `view ${ctx.name} name\n`,
    published: [],
    packageJson: ctx.packageJson,
  });
});

test.each([
  ['libs/contract', '@heynixie/contract', 'heynixie-contract-1.2.3.tgz'],
  ['deploy/pulumi-k8s', '@heynixie/pulumi-k8s', 'heynixie-pulumi-k8s-1.2.3.tgz'],
])('it publishes nothing when npm holds the version of %s', async (packageDir, name) => {
  const ctx = setupTest(packageDir, name);

  const result = await ctx.runPublish({ PUBLISHED: '1.2.3' });

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: `${ctx.name}@1.2.3 is on npm already\n`,
    calls: `view ${ctx.name} name\nview ${ctx.name}@1.2.3 version\n`,
    published: [],
    packageJson: ctx.packageJson,
  });
});

test.each([
  ['libs/contract', '@heynixie/contract', 'heynixie-contract-1.2.3.tgz'],
  ['deploy/pulumi-k8s', '@heynixie/pulumi-k8s', 'heynixie-pulumi-k8s-1.2.3.tgz'],
])('it publishes the packed tarball of %s with provenance', async (packageDir, name, tarball) => {
  const ctx = setupTest(packageDir, name);

  const result = await ctx.runPublish({});

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: '',
    calls: `view ${ctx.name} name\nview ${ctx.name}@1.2.3 version\npublish ${tarball} --access public --provenance\n`,
    published: [tarball],
    packageJson: ctx.packageJson,
  });

  const published = await ctx.readPublished(tarball, 'package/package.json');

  expect(JSON.parse(published)).toStrictEqual(expect.objectContaining({ version: '1.2.3' }));
});

test('it builds the backup image of the release into the Kubernetes component', async () => {
  const ctx = setupTest('deploy/pulumi-k8s', '@heynixie/pulumi-k8s');
  const sourcePath = join(ctx.workPath, 'deploy/pulumi-k8s/src/release-backup-image.ts');
  const source = readFileSync(sourcePath, 'utf8');

  await ctx.runPublish({});

  const built = await ctx.readPublished('heynixie-pulumi-k8s-1.2.3.tgz', 'package/dist/index.js');

  expect(built).toInclude(`ghcr.io/example/nixie-backup:1.2.3@${ctx.backupDigest}`);
  expect(readFileSync(sourcePath, 'utf8')).toBe(source);
});

test('it fails the Kubernetes component when the release names no backup image', async () => {
  const ctx = setupTest('deploy/pulumi-k8s', '@heynixie/pulumi-k8s');

  const result = await ctx.runPublish({ BACKUP_IMAGE: '' });

  expect(result.exitCode).toBe(1);
  expect(result.calls).toBe('');
  expect(result.published).toStrictEqual([]);

  expect(result.stdout).toInclude(
    "::error::@heynixie/pulumi-k8s needs BACKUP_IMAGE to name the release's backup image",
  );
});
