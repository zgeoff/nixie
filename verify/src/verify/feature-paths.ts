import { join } from 'node:path';
import { collectReachedFolders } from './collect-reached-folders';
import { corePaths } from './core-paths';
import { readWorkspacePackages } from './read-workspace-packages';
import type { WorkspacePackage } from './types';

// Globs are root-relative, as `git ls-files` prints them, and match with Bun.Glob. A feature's
// startup or record-write code, such as a projection, also runs in its own journey, so a change
// that breaks it there fails that journey: only what every turn reads goes in the core list.
interface FeatureReach {
  // package folders, such as `modules/coding`, whose workspace dependencies the feature also holds
  readonly packages: readonly string[];
  readonly paths: readonly string[];
}

const workspace = await readWorkspace(join(import.meta.dir, '..', '..', '..'));

const taskPages = 'apps/web/src/routes/tasks.*.tsx';

const coding: FeatureReach = {
  packages: ['modules/coding', 'adapters/coding-atc'],
  paths: ['apps/server/src/coding/**', taskPages],
};

const calls: FeatureReach = {
  packages: [],

  // Listed as paths, because the walk would follow these packages' dependency on `modules/api`
  // into `modules/coding`, and flag the coding features on a calls change.
  paths: [
    'modules/calls/**',
    'adapters/speech-gpt-live/**',
    'apps/server/src/call/**',
    'apps/server/src/part/{calls-part-declarations,start-calls-part}.ts',
    'apps/server/src/part/harness-speech.ts',
    'apps/web/src/routes/call.tsx',

    // the call screen's journey checks that the call bar stays on the tasks page
    taskPages,
  ],
};

const devices: FeatureReach = {
  packages: ['guests/render'],
  paths: [
    // a path, for the reason that `calls` lists its modules as paths
    'modules/devices/**',
    'apps/server/src/part/{build-device-fetch,devices-part-declarations,start-render-part}.ts',
    'apps/web/src/routes/{add-device,device,device-view}.tsx',
  ],
};

const images: FeatureReach = {
  packages: ['adapters/image-gemini', 'adapters/image-openai'],
  paths: [
    'apps/server/src/part/{build-image-providers,image-provider-api,start-images-part}.ts',
    'apps/web/src/routes/images.tsx',
  ],
};

const search: FeatureReach = {
  packages: ['adapters/search-kagi'],
  paths: ['apps/server/src/part/start-search-part.ts'],
};

const google: FeatureReach = {
  packages: ['modules/google', 'adapters/connector-google'],
  paths: [
    'apps/server/src/connection/**',
    'apps/server/src/google/**',
    'apps/server/src/part/{collect-owner-addresses,pick-watch-interval-ms,read-mail-html,start-connections-part,start-google-tools-part}.ts',
    'apps/web/src/connection/**',
    'apps/web/src/routes/settings.connections.*.tsx',
  ],
};

const computer: FeatureReach = {
  packages: ['guests/computer'],
  paths: [
    'apps/server/src/computer/**',
    'apps/server/src/part/start-computer-part.ts',
    'apps/web/src/routes/computer.tsx',
  ],
};

const coreOnly: FeatureReach = { packages: [], paths: [] };

// The conversation's status line and its events block, and a job run's blocks, render through these
// files, so the chat turn and the task pages that show a run read them too.
const connectionStatus = 'apps/server/src/connection/**';

// Each feature holds the core list, the folders of its packages and of the workspace packages
// they depend on, from each `package.json` as this file loads, and its own server and web files.
export const featurePaths = {
  'sign-in-enrol': buildFeatureGlobs(workspace, coreOnly),
  'chat-turn': buildFeatureGlobs(workspace, { packages: [], paths: [connectionStatus] }),
  'memory-approval': buildFeatureGlobs(workspace, {
    packages: [],
    paths: ['apps/web/src/routes/{memory,moments,moments_.$momentID}.tsx'],
  }),
  'policy-proposal': buildFeatureGlobs(workspace, coreOnly),
  'rule-condition': buildFeatureGlobs(workspace, {
    packages: [],
    paths: ['apps/web/src/mandate/**', 'apps/web/src/routes/mandates.tsx'],
  }),
  'task-control': buildFeatureGlobs(workspace, {
    packages: [],
    paths: [taskPages, connectionStatus],
  }),
  'coding-session': buildFeatureGlobs(workspace, coding),
  'coding-supervision': buildFeatureGlobs(workspace, coding),
  'call-hand-off': buildFeatureGlobs(workspace, calls),
  'call-screen': buildFeatureGlobs(workspace, calls),
  'call-device-show': buildFeatureGlobs(workspace, joinReaches(calls, devices)),
  'device-view': buildFeatureGlobs(workspace, devices),
  'mail-wake': buildFeatureGlobs(workspace, {
    packages: ['modules/mail'],
    paths: ['apps/server/src/mail/**'],
  }),
  'phone-text': buildFeatureGlobs(workspace, {
    packages: ['modules/phone', 'adapters/phone-twilio'],
    paths: ['apps/server/src/phone/**'],
  }),
  drawing: buildFeatureGlobs(workspace, images),
  'images-page': buildFeatureGlobs(workspace, images),
  'notebook-pages': buildFeatureGlobs(workspace, {
    packages: ['modules/notebook'],
    paths: [
      'apps/server/src/part/start-notebook-part.ts',
      'apps/web/src/notebook/**',
      'apps/web/src/routes/notebook*.tsx',
    ],
  }),
  'google-connections': buildFeatureGlobs(workspace, google),
  'google-off': buildFeatureGlobs(workspace, google),
  'calls-off': buildFeatureGlobs(workspace, calls),
  'devices-off': buildFeatureGlobs(workspace, devices),
  'search-images-off': buildFeatureGlobs(workspace, joinReaches(search, images)),
  'gmail-tools': buildFeatureGlobs(workspace, google),
  'gmail-wake': buildFeatureGlobs(workspace, google),
  'calendar-tools': buildFeatureGlobs(workspace, google),
  'drive-tools': buildFeatureGlobs(workspace, google),
  'conversation-reset': buildFeatureGlobs(workspace, {
    packages: [],
    paths: [
      'apps/server/src/erasure/**',
      'apps/server/src/server/{build-server-reset,make-stop-work}.ts',
      'apps/server/src/cli/create-reset-commands.ts',
    ],
  }),
  'device-in-browser': buildFeatureGlobs(workspace, devices),
  'device-screen': buildFeatureGlobs(workspace, devices),
  'device-layout': buildFeatureGlobs(workspace, devices),
  'mcp-servers': buildFeatureGlobs(workspace, {
    packages: ['modules/mcp'],
    paths: [
      'apps/server/src/part/start-mcp-part.ts',
      'apps/web/src/mcp/**',
      'apps/web/src/routes/settings.mcp.tsx',
    ],
  }),
  'live-updates': buildFeatureGlobs(workspace, coreOnly),
  'job-skills': buildFeatureGlobs(workspace, coreOnly),
  'spend-routes': buildFeatureGlobs(workspace, {
    packages: ['apps/model-gateway', 'adapters/spend-model-gateway', 'adapters/rates-frankfurter'],
    paths: ['apps/web/src/routes/spend.tsx'],
  }),
  'computer-browser': buildFeatureGlobs(workspace, computer),
  'computer-shell': buildFeatureGlobs(workspace, computer),
  'computer-screen': buildFeatureGlobs(workspace, computer),
  'computer-watch': buildFeatureGlobs(workspace, joinReaches(computer, images)),
  'computer-off': buildFeatureGlobs(workspace, computer),
  'trusted-places': buildFeatureGlobs(workspace, computer),
  'place-trust-card': buildFeatureGlobs(workspace, {
    packages: computer.packages,
    paths: [...computer.paths, 'apps/web/src/approval/**', 'apps/web/src/conversation/**'],
  }),
} as const satisfies Record<string, readonly string[]>;

interface Workspace {
  readonly packages: readonly WorkspacePackage[];
  readonly coreFolders: readonly string[];
  readonly coreGlobs: readonly string[];
}

function buildFeatureGlobs(workspaceFacts: Workspace, reach: FeatureReach): string[] {
  const ownFolders = collectReachedFolders(reach.packages, workspaceFacts.packages).filter(
    (folder) => !workspaceFacts.coreFolders.includes(folder) && !folder.startsWith('libs/'),
  );

  return [
    ...workspaceFacts.coreGlobs,
    ...ownFolders.map((folder) => `${folder}/**`),
    ...reach.paths,
  ];
}

async function readWorkspace(rootDir: string): Promise<Workspace> {
  const packages = await readWorkspacePackages(rootDir);

  const coreFolders = collectReachedFolders(corePaths.packages, packages);

  return {
    packages,
    coreFolders,
    coreGlobs: [...coreFolders.map((folder) => `${folder}/**`), ...corePaths.globs],
  };
}

function joinReaches(first: FeatureReach, second: FeatureReach): FeatureReach {
  return {
    packages: [...first.packages, ...second.packages],
    paths: [...first.paths, ...second.paths],
  };
}

// A change to one of these changes every feature: the verify CLI and its harness, the test helpers
// the harness starts nixie with, and the preview recipe the `preview` target runs.
export const sharedPaths = [
  'verify/**',
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

  // The braces also match the deleted files of the removed root e2e workspace, whose verify CLI and
  // helpers moved to `verify/` and each app's `test-utils`, which map as shared paths.
  '{e2e,apps/*/e2e}/**',

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
  '.agents/**',
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

  // 4. Code that no journey runs: the backup job, the imp sandbox adapter, and the deployment
  //    recipes.
  'apps/backup-job/**',
  'adapters/sandbox-imp/**',
  'deploy/**',
] as const;
