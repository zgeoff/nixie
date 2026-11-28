import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  collectFeatureScopes,
  createNodeRepoHost,
  createWringer,
  isGlobMatch,
  local,
  resolveFeatures,
} from '@wringer/core';
import type { Wringer } from '@wringer/core';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createVerifyRegistry } from './create-verify-registry';
import { featureFiles, sharedPaths } from './feature-files';

async function setupTest() {
  const rootDir = join(import.meta.dir, '..', '..', '..');
  const gateSchema = z.object({ match: z.string(), skills: z.array(z.string()) });
  const rulesPath = join(rootDir, '.claude', 'skill-gate.json');

  const rulesJSON: unknown = await Bun.file(rulesPath).json();

  const rules = z.object({ gates: z.array(gateSchema) }).parse(rulesJSON);
  const registry = createVerifyRegistry();

  const trackedText = await Bun.$`git ls-files`.cwd(rootDir).text();

  return {
    rootDir,
    rules,
    trackedPaths: trackedText.trim().split('\n'),
    isIgnored: (path: string) => isGlobMatch(path, registry.ignore),
    isShared: (path: string) => isGlobMatch(path, registry.shared),

    // The files that the entries of these features reach together, found in one walk.
    readReached: async (featureNames: readonly string[]): Promise<ReadonlySet<string>> => {
      const [first] = registry.features;

      invariant(first !== undefined, 'the registry has features');

      const entries = registry.features
        .filter((feature) => featureNames.includes(feature.name))
        .flatMap((feature) => feature.entries);

      const walked: Wringer = {
        ...registry,
        features: [{ ...first, name: 'walked', entries, extra: [], paths: [] }],
      };

      const resolved = await resolveFeatures(createNodeRepoHost(), walked, rootDir);

      return new Set(resolved.reach.get('walked')?.reached);
    },

    // The names of the features whose entries include the file.
    readClaimants: (path: string): readonly string[] =>
      registry.features
        .filter((feature) => feature.entries.includes(path))
        .map((feature) => feature.name),

    // Whether a change to the path flags the feature, resolved from the real registry narrowed to
    // that feature.
    probeFlagged: async (path: string, featureName: string): Promise<boolean> => {
      const narrowed: Wringer = {
        ...registry,
        features: registry.features.filter((feature) => feature.name === featureName),
      };

      const resolved = await resolveFeatures(createNodeRepoHost(), narrowed, rootDir);

      return collectFeatureScopes(resolved.wringer).some(
        (scope) => isGlobMatch(path, scope.globs) && !isGlobMatch(path, registry.ignore),
      );
    },
    collectFeatureNames: () => registry.features.map((feature) => feature.name),
    collectFeatures: () => registry.features,
  };
}

test('it asks for the verify skill before an edit under each entry and shared path', async () => {
  const ctx = await setupTest();

  const verifyGlobs = ctx.rules.gates
    .filter((gate) => gate.skills.includes('verify'))
    .map((gate) => new Bun.Glob(gate.match));

  const entries = Object.values(featureFiles).flatMap((files) => files.entries);

  const unasked = [...entries, ...sharedPaths].filter(
    (glob) => !verifyGlobs.some((gate) => gate.match(glob) || gate.match(`${glob}/file`)),
  );

  expect(unasked).toStrictEqual([]);
});

test('it gives each feature a journey file that git tracks', async () => {
  const ctx = await setupTest();

  const missing = Object.values(featureFiles)
    .flatMap((files) => files.extra)
    .filter((path) => !ctx.trackedPaths.includes(path));

  expect(missing).toStrictEqual([]);
});

test('it reaches the core files from the entries of the first feature', async () => {
  const ctx = await setupTest();

  const [first] = ctx.collectFeatureNames();
  const featureNames = first === undefined ? [] : [first];

  const reached = await ctx.readReached(featureNames);

  expect([...reached]).toIncludeAllMembers([
    'modules/sessions/src/index.ts',
    'modules/policy/src/index.ts',
    'modules/log/src/index.ts',
    'guests/conversation/src/main.ts',
    'libs/db/src/index.ts',
    'apps/web/src/routes/__root.tsx',
    'apps/web/src/components/app-shell.tsx',
  ]);
});

test.each([
  'apps/server/src/main.ts',
  'apps/server/src/part/start-part-graph.ts',
  'modules/api/src/index.ts',
])('it flags every feature for a change to the shared file %s', async (path) => {
  const ctx = await setupTest();

  expect(ctx.isShared(path)).toBe(true);
});

test('it flags each feature for its own journey file', async () => {
  const ctx = await setupTest();

  const unflagged = ctx.collectFeatures().filter((feature) => {
    const journeyPath = `.agents/skills/verify/references/feature-${feature.name}.md`;

    return ctx.isIgnored(journeyPath) || !isGlobMatch(journeyPath, feature.extra);
  });

  expect(unflagged).toStrictEqual([]);
});

test('it gives the proposals route to the policy-proposal feature alone', async () => {
  const ctx = await setupTest();

  const claimants = ctx.readClaimants('apps/web/src/routes/proposals.tsx');

  expect(claimants).toStrictEqual(['policy-proposal']);
});

test('it flags coding-session for a change to the fake coding gateway that it imports', async () => {
  const ctx = await setupTest();

  const flagged = await ctx.probeFlagged(
    'adapters/coding-atc/src/test-utils/start-fake-atc-gateway.ts',
    'coding-session',
  );

  expect(flagged).toBe(true);
});

test.each([
  'modules/calls/src/record/call-turn-timed-codec.ts',
  'modules/memory/src/typed/is-typed-yes.ts',
  'guests/code/Dockerfile',
])('it flags no feature for a change to the file %s, which no journey runs', async (path) => {
  const ctx = await setupTest();

  expect(ctx.isIgnored(path)).toBe(true);
  expect(ctx.isShared(path)).toBe(false);
});

test('it starts no walk from a file that an ignore glob matches', async () => {
  const ctx = await setupTest();

  const ignoredEntries = Object.entries(featureFiles).flatMap(([name, files]) =>
    files.entries.filter((entry) => ctx.isIgnored(entry)).map((entry) => `${name}: ${entry}`),
  );

  expect(ignoredEntries).toStrictEqual([]);
});

test('it flags only the feature whose entry imports a file that no other entry imports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'verify-entries-'));

  onTestFinished(() => rm(directory, { recursive: true }));

  const files = {
    'src/pantry.ts': "import { stock } from './stock';\nexport const pantry = stock;\n",
    'src/stock.ts': 'export const stock = 1;\n',
    'src/orders.ts': "import { cart } from './cart';\nexport const orders = cart;\n",
    'src/cart.ts': 'export const cart = 2;\n',
    'src/shared.ts': 'export const shared = 3;\n',
  };

  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(directory, path)), { recursive: true });

    await Bun.write(join(directory, path), text);
  }

  await Bun.$`git init -q && git add . && git -c user.name=test -c user.email=test@example.test commit -q -m init`.cwd(
    directory,
  );

  const wringer = createWringer({ name: 'entries-test' })
    .target('local', {
      mode: 'attach',
      access: 'read-only',
      refusalHint: 'none',
      host: local(),
      endpoints: () => ({}),
      drivers: {},
    })
    .feature(
      { name: 'pantry', summary: 'Browse the pantry', entries: ['src/pantry.ts'] },
      { name: 'orders', summary: 'Place an order', entries: ['src/orders.ts'] },
    )
    .build();

  const resolved = await resolveFeatures(createNodeRepoHost(), wringer, directory);

  const flagged = (path: string) =>
    collectFeatureScopes(resolved.wringer)
      .filter((scope) => isGlobMatch(path, scope.globs))
      .map((scope) => scope.name);

  expect(flagged('src/stock.ts')).toStrictEqual(['pantry']);
  expect(flagged('src/cart.ts')).toStrictEqual(['orders']);
  expect(flagged('src/shared.ts')).toStrictEqual([]);
});
