// Globs are root-relative, as `git ls-files` prints them, and match with Bun.Glob. Every journey
// runs the server on the test sandbox, its conversation guest, and the web client behind one
// origin, so each feature holds all of their source.
const everyJourney = [
  'apps/server/**',
  'apps/web/**',
  'modules/**',
  'libs/**',
  'guests/**',
  'adapters/definitions-repo-github/**',
  'adapters/encoder-onnx/**',
  'adapters/search-kagi/**',
  'nixie-test-build.d.ts',
  'bun-serve-options.d.ts',
] as const;

export const featurePaths = {
  'sign-in-enrol': [...everyJourney],
  'chat-turn': [...everyJourney],
  'memory-approval': [...everyJourney],
  'policy-proposal': [...everyJourney],
  'task-control': [...everyJourney],
} as const satisfies Record<string, readonly string[]>;

// A change to one of these changes every feature: the verify CLI and its harness, the test helpers
// the harness starts nixie with, and the preview recipe the `preview` target runs.
export const sharedPaths = [
  'e2e/src/verify/**',
  'apps/server/src/test-utils/**',
  'apps/web/src/test-utils/**',
  'libs/testing/**',
  'preview/**',
] as const;

// A path that one of these globs matches counts as no change, even where a feature's or a shared
// glob matches it too.
export const ignoredPaths = [
  // 1. No runtime effect: prose, tests, spikes and suites. Never `**/*.md`: nixie reads its
  //    definitions' markdown at run time.
  'docs/**',
  '**/README.md',
  '**/CHANGELOG.md',
  'AGENTS.md',
  'CLAUDE.md',
  '**/LICENSE',
  '**/*.test.ts',
  '**/*.test.tsx',
  'research/**',
  'evals/**',
  'integration/**',
  'e2e/{crash,journeys,web}/**',
  'e2e/src/test-utils/**',
  'e2e/{.gitkeep,tsconfig.json,turbo.json}',

  // 2. Build, lint, CI and editor wiring, which Bun never reads when it runs the source.
  '**/tsconfig*.json',
  '**/turbo.json',
  'bunfig.toml',
  'bunfig.imp.toml',
  'rig.config.ts',
  'knip.json',
  '.oxlintrc.json',
  '.oxfmtrc.json',
  '.formatignore',
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.gitleaks.toml',
  '.git-blame-ignore-revs',
  '.dockerignore',
  '.env.example',
  'commitlint.config.js',
  'lefthook.yml',
  'audit-ignores.json',
  'socket.yml',
  'review.json',
  'renovate.json',
  '.claude/**',
  '.codex/**',
  '.github/**',
  'scripts/**',

  // 3. The files that Renovate (the root catalog, the lock file, the Bun pin) and release-please
  //    (each package's version, the manifest) change. A dependency bump merges on green CI, and
  //    the verify workflow skips the release pull request.
  '**/package.json',
  'bun.lock',
  '.bun-version',
  '.release-please-manifest.json',
  'release-please-config.json',

  // 4. Code that no journey runs: the backup job, the model gateway, the imp sandbox adapter, and
  //    the deployment recipes.
  'apps/backup-job/**',
  'apps/model-gateway/**',
  'adapters/sandbox-imp/**',
  'deploy/**',
] as const;
