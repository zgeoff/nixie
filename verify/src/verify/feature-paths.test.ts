import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { collectFeatureScopes, isGlobMatch } from '@wringer/core';
import { z } from 'zod';
import { createVerifyRegistry } from './create-verify-registry';
import { featurePaths, sharedPaths } from './feature-paths';

async function setupTest() {
  const gateSchema = z.object({ match: z.string(), skills: z.array(z.string()) });
  const rootDir = join(import.meta.dir, '..', '..', '..');
  const rulesPath = join(rootDir, '.claude', 'skill-gate.json');

  const rulesJSON: unknown = await Bun.file(rulesPath).json();

  const rules = z.object({ gates: z.array(gateSchema) }).parse(rulesJSON);
  const registry = createVerifyRegistry();
  const scopes = collectFeatureScopes(registry);

  const trackedText = await Bun.$`git ls-files`.cwd(rootDir).text();

  return {
    rules,
    featureNames: registry.features.map((feature) => feature.name),
    trackedPaths: trackedText.trim().split('\n'),
    isIgnored: (path: string) => isGlobMatch(path, registry.ignore),
    collectFlagged: (path: string) =>
      isGlobMatch(path, registry.ignore)
        ? []
        : scopes.filter((scope) => isGlobMatch(path, scope.globs)).map((scope) => scope.name),
  };
}

test('it asks for the verify skill before an edit under each feature path and shared path', async () => {
  const ctx = await setupTest();

  const verifyGlobs = ctx.rules.gates
    .filter((gate) => gate.skills.includes('verify'))
    .map((gate) => new Bun.Glob(gate.match));

  const mapped = [...Object.values(featurePaths).flat(), ...sharedPaths];

  expect(mapped.filter((glob) => !verifyGlobs.some((gate) => gate.match(glob)))).toStrictEqual([]);
});

test('it flags only the coding features for a change under modules/coding', async () => {
  const ctx = await setupTest();

  expect(ctx.collectFlagged('modules/coding/src/runner/build-coding-runner.ts')).toStrictEqual([
    'coding-session',
    'coding-supervision',
  ]);
});

test('it flags only the Google features for a change under adapters/connector-google', async () => {
  const ctx = await setupTest();

  expect(ctx.collectFlagged('adapters/connector-google/src/index.ts')).toStrictEqual([
    'google-connections',
    'google-off',
    'gmail-tools',
    'gmail-wake',
    'calendar-tools',
    'drive-tools',
  ]);
});

test('it flags the calls features, and no coding feature, for a change under modules/calls', async () => {
  const ctx = await setupTest();

  expect(ctx.collectFlagged('modules/calls/src/index.ts')).toStrictEqual([
    'call-hand-off',
    'call-screen',
    'call-device-show',
    'calls-off',
  ]);
});

test('it flags the device features for a change under modules/devices', async () => {
  const ctx = await setupTest();

  expect(ctx.collectFlagged('modules/devices/src/index.ts')).toStrictEqual([
    'call-device-show',
    'devices-off',
    'device-in-browser',
    'device-view',
    'device-screen',
    'device-layout',
  ]);
});

test.each([
  'apps/server/src/main.ts',
  'apps/server/src/part/start-part-graph.ts',
  'apps/web/src/routes/__root.tsx',
  'apps/web/src/components/app-shell.tsx',
  'modules/api/src/index.ts',
  'modules/sessions/src/index.ts',
  'modules/policy/src/index.ts',
  'modules/log/src/index.ts',
  'guests/conversation/src/main.ts',
  'libs/db/src/index.ts',
])('it flags every feature for a change to the core file %s', async (path) => {
  const ctx = await setupTest();

  expect(ctx.collectFlagged(path)).toStrictEqual(ctx.featureNames);
});

test('it reaches every module, adapter and guest folder from a feature', async () => {
  const ctx = await setupTest();

  const folders = new Set(
    ctx.trackedPaths
      .filter((path) => /^(?<kind>modules|adapters|guests)\//u.test(path))
      .map((path) => path.split('/').slice(0, 2).join('/')),
  );

  const unreached = [...folders].filter((folder) => {
    const runPaths = ctx.trackedPaths.filter(
      (path) => path.startsWith(`${folder}/`) && !ctx.isIgnored(path),
    );

    return runPaths.length > 0 && runPaths.every((path) => ctx.collectFlagged(path).length === 0);
  });

  expect(unreached).toStrictEqual([]);
});

test('it maps every tracked file to a feature or the ignore list', async () => {
  const ctx = await setupTest();

  expect(
    ctx.trackedPaths.filter(
      (path) => !ctx.isIgnored(path) && ctx.collectFlagged(path).length === 0,
    ),
  ).toStrictEqual([]);
});
