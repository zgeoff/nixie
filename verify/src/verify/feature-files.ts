import { join } from 'node:path';
import { collectEntryFiles } from './collect-entry-files';

// Globs are root-relative, as `git ls-files` prints them, and match with Bun.Glob. A feature owns
// the files that its entries import, and its extra files.

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

  // Skills, except the verify skill's own files, which hold each journey: a feature lists its
  // journey file in `extra`, and an ignore glob would override that.
  '.agents/skills/[!v]*/**',
  '.agents/skills/verify/SKILL.md',
  '.agents/skills/verify/references/{edit-the-skill,exit-codes,preview-setup,prod-check,publish}.md',
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

  // 4. Code that no journey runs: the backup job, the imp sandbox adapter, the code guest, the
  //    tests' mock network, source that only a test imports, and the deployment recipes.
  'apps/backup-job/**',
  'adapters/sandbox-imp/**',
  'libs/mock-server/**',
  'modules/definitions/src/change/rules-change-proposed-codec.ts',
  'guests/code/**',
  'modules/calls/src/record/call-turn-timed-codec.ts',
  'modules/credentials/src/file/secrets-entry-names-match.ts',
  'modules/definitions/src/seed/read-snapshot-tool-effects.ts',
  'modules/definitions/src/utils/format-zoned-iso.ts',
  'modules/memory/src/memory/memory-rated-codec.ts',
  'modules/memory/src/typed/is-typed-yes.ts',
  'deploy/**',

  // 5. Test doubles, suites and fixtures that only tests load. Not the helpers that the harness
  //    starts: those of `modules/google`, `modules/mcp` and `adapters/coding-atc`.
  'modules/{[!gm]*,m[!c]*}/src/test-utils/**',
  '{adapters/{sandbox-imp,speech-gpt-live},guests/*,libs/*}/src/test-utils/**',
  '{modules,adapters}/*/src/mocks/**',
  'apps/web/src/mocks/**',
  'modules/*/src/*-test-record-kind.d.ts',
  'modules/memory/src/{evals,fixtures}/**',
  'guests/conversation/src/sdk-contract/**',
  'libs/wire/{backup,turn-input}-formats/**',

  // 6. Types that Bun erases, and the scripts and files that generate or check what CI publishes.
  'guests/codex/src/protocol/**',
  'libs/contract/{openapi.json,accepted-breaks.txt}',
  'libs/contract/src/{contract/build-openapi-document,run-openapi-document}.ts',
  'libs/db/src/run-*.ts',
  'libs/db/src/migration/{read-built-tables,render-migration-notes,render-table-types}.ts',
  'libs/secret-scan/src/{rule-build/**,run-rule-build.ts,run-rule-check.ts}',
  'modules/definitions/definitions-manifest.schema.json',
  'modules/definitions/src/{run-manifest-json-schema,run-task-yaml-samples}.ts',
  'modules/definitions/src/skill/build-manifest-json-schema.ts',
  'modules/definitions/src/runtime-task/write-task-yaml-samples.ts',
  'modules/policy/definitions-*.schema.json',
  'modules/policy/src/{budget/build-budgets-json-schema,rule/build-rules-json-schema,run-rules-json-schema}.ts',
] as const;

// Each entry stands for the files it names that no ignore glob matches. A test that sits in an
// entry's folder would otherwise start the walk too, and give the feature every file the test
// imports.
const trackedFiles = readTrackedFiles();

const entryFileCache = new Map<string, readonly string[]>();

// What every journey runs: the turn path, which each journey drives with a message, and the
// conversation page it opens. When you can't tell whether a file reaches a feature, add its folder
// here: a missed feature costs more than a journey.
const turnEntries = [
  // the turn path: each turn's session, its sandbox runner, and the tools and records it uses
  'modules/sessions/src/index.ts',

  // the input each turn starts from
  'modules/turn-inputs/src/index.ts',

  // the guest that runs every model turn
  'guests/conversation/src/{main,index}.ts',

  // the rules and the proposals that every tool call passes through
  'modules/policy/src/index.ts',

  // the record log that every write goes through
  'modules/log/src/index.ts',

  // every turn's status reads the pinned memory and the week's moments
  'modules/memory/src/index.ts',

  // memory's encoder, which the server loads at start
  'adapters/encoder-onnx',

  // every conversation reads its skill list
  'modules/skills/src/index.ts',

  // the rules and prompts in force for every turn
  'modules/definitions/src/index.ts',

  // the health and readiness that `doctor` checks before every journey
  'modules/ops/src/index.ts',

  // no journey checks these
  'modules/backup/src/index.ts',
  'adapters/definitions-repo-github/src/index.ts',
  'guests/fetch/src/main.ts',
  'guests/codex/src/{main,index}.ts',

  // the web shell and the conversation page, which every journey opens
  'apps/web/src/routes/{__root,index}.tsx',

  // the database's migrations, which `read-migrations.ts` loads with an import() of a computed path
  'libs/db/src/migrations',

  // the SQLite worker, which the database starts from a URL
  'libs/db/src/sqlite',

  // the web client's helpers, which the routes and the shell reach by their return paths
  'apps/web/src/client',
] as const;

const taskPages = 'apps/web/src/routes/{tasks.$taskID,tasks.ended,tasks.index}.tsx';

// The conversation's status line and its events block, and a job run's blocks, render through these
// files, so the chat turn and the task pages that show a run read them too.
const connectionStatus = 'apps/server/src/connection';

const coding = [
  'modules/coding/src/index.ts',
  'adapters/coding-atc/src/index.ts',

  // the fake coding gateway that the harness starts when NIXIE_VERIFY_CODING=1
  'adapters/coding-atc/src/test-utils',
  'apps/server/src/coding',
  taskPages,
] as const;

const calls = [
  'modules/calls/src/index.ts',
  'adapters/speech-gpt-live/src/index.ts',
  'apps/server/src/call',
  buildPartGlob('calls-part-declarations,start-calls-part,harness-speech'),
  'apps/web/src/routes/call.tsx',

  // the call screen's journey checks that the call bar stays on the tasks page
  taskPages,
] as const;

const devices = [
  'modules/devices/src/index.ts',
  'guests/render/src/{main,test-main}.ts',
  buildPartGlob('build-device-fetch,devices-part-declarations,start-render-part'),
  'apps/web/src/routes/{add-device,device,device-view}.tsx',
] as const;

const images = [
  'adapters/image-gemini/src/index.ts',
  'adapters/image-openai/src/index.ts',
  buildPartGlob('build-image-providers,image-provider-api,start-images-part'),
  'apps/web/src/routes/images.tsx',
] as const;

const search = ['adapters/search-kagi/src/index.ts', buildPartGlob('start-search-part')] as const;

const google = [
  'modules/google/src/index.ts',

  // the fake Gmail, Calendar and Drive that the harness starts
  'modules/google/src/test-utils',
  'adapters/connector-google/src/index.ts',
  connectionStatus,
  'apps/server/src/google',
  buildPartGlob(
    'collect-owner-addresses,pick-watch-interval-ms,read-mail-html,start-connections-part,start-google-tools-part',
  ),
  'apps/web/src/connection',
  'apps/web/src/routes/settings.connections.*.tsx',
] as const;

const computer = [
  'guests/computer/src/main.ts',

  // the shell's bridge process and the stub main that the harness starts the guest with
  'guests/computer/src/shell/bridge-main.ts',
  'guests/computer/src/test-main.ts',
  'apps/server/src/computer',
  buildPartGlob('start-computer-part'),
  'apps/web/src/routes/computer.tsx',
] as const;

export const featureFiles = {
  'sign-in-enrol': readFeatureFiles('sign-in-enrol', []),
  'chat-turn': readFeatureFiles('chat-turn', [
    connectionStatus,

    // the pages that the conversation page's navigation links, which no journey opens
    'apps/web/src/routes/{definitions,files,passkeys,reminders}.tsx',
  ]),
  'memory-approval': readFeatureFiles('memory-approval', [
    'apps/web/src/routes/{memory,moments,moments_.$momentID}.tsx',
  ]),
  'policy-proposal': readFeatureFiles('policy-proposal', ['apps/web/src/routes/proposals.tsx']),
  'rule-condition': readFeatureFiles('rule-condition', [
    'apps/web/src/mandate',
    'apps/web/src/routes/mandates.tsx',
  ]),
  'task-control': readFeatureFiles('task-control', [taskPages, connectionStatus]),
  'coding-session': readFeatureFiles('coding-session', coding),
  'coding-supervision': readFeatureFiles('coding-supervision', coding),
  'call-hand-off': readFeatureFiles('call-hand-off', calls),
  'call-screen': readFeatureFiles('call-screen', calls),
  'call-device-show': readFeatureFiles('call-device-show', [...calls, ...devices]),
  'device-view': readFeatureFiles('device-view', devices),
  'mail-wake': readFeatureFiles('mail-wake', ['modules/mail/src/index.ts', 'apps/server/src/mail']),
  'phone-text': readFeatureFiles('phone-text', [
    'modules/phone/src/index.ts',
    'adapters/phone-twilio/src/index.ts',
    'apps/server/src/phone',
  ]),
  drawing: readFeatureFiles('drawing', images),
  'images-page': readFeatureFiles('images-page', images),
  'notebook-pages': readFeatureFiles('notebook-pages', [
    'modules/notebook/src/index.ts',
    buildPartGlob('start-notebook-part'),
    'apps/web/src/notebook',
    'apps/web/src/routes/notebook{,.$note,.index,.check}.tsx',
  ]),
  'google-connections': readFeatureFiles('google-connections', google),
  'google-off': readFeatureFiles('google-off', google),
  'calls-off': readFeatureFiles('calls-off', calls),
  'devices-off': readFeatureFiles('devices-off', devices),
  'search-images-off': readFeatureFiles('search-images-off', [...search, ...images]),
  'gmail-tools': readFeatureFiles('gmail-tools', google),
  'gmail-wake': readFeatureFiles('gmail-wake', google),
  'calendar-tools': readFeatureFiles('calendar-tools', google),
  'drive-tools': readFeatureFiles('drive-tools', google),
  'conversation-reset': readFeatureFiles('conversation-reset', [
    'apps/server/src/erasure',
    'apps/server/src/server/{build-server-reset,make-stop-work}.ts',
    'apps/server/src/cli/create-reset-commands.ts',
  ]),
  'device-in-browser': readFeatureFiles('device-in-browser', devices),
  'device-screen': readFeatureFiles('device-screen', devices),
  'device-layout': readFeatureFiles('device-layout', devices),
  'mcp-servers': readFeatureFiles('mcp-servers', [
    'modules/mcp/src/index.ts',
    'modules/mcp/src/test-utils',
    buildPartGlob('start-mcp-part'),
    'apps/web/src/mcp',
    'apps/web/src/routes/settings.mcp.tsx',
  ]),
  'live-updates': readFeatureFiles('live-updates', []),
  'job-skills': readFeatureFiles('job-skills', []),
  'spend-routes': readFeatureFiles('spend-routes', [
    'apps/model-gateway',
    'adapters/spend-model-gateway/src/index.ts',
    'adapters/rates-frankfurter/src/index.ts',
    'apps/web/src/routes/spend.tsx',
  ]),
  'computer-browser': readFeatureFiles('computer-browser', computer),
  'computer-shell': readFeatureFiles('computer-shell', computer),
  'computer-screen': readFeatureFiles('computer-screen', computer),
  'computer-watch': readFeatureFiles('computer-watch', [...computer, ...images]),
  'computer-off': readFeatureFiles('computer-off', computer),
  'trusted-places': readFeatureFiles('trusted-places', computer),
  'place-trust-card': readFeatureFiles('place-trust-card', [
    ...computer,
    'apps/web/src/approval',
    'apps/web/src/conversation',
  ]),
} as const;

interface FeatureFiles {
  readonly entries: readonly string[];
  readonly extra: readonly string[];
}

function readFeatureFiles(name: string, ownEntries: readonly string[]): FeatureFiles {
  return {
    entries: [...turnEntries, ...ownEntries].flatMap((entry) => readEntryFiles(entry)),

    extra: [`.agents/skills/verify/references/feature-${name}.md`],
  };
}

function readEntryFiles(entry: string): readonly string[] {
  const cached = entryFileCache.get(entry);

  if (cached !== undefined) {
    return cached;
  }

  const files = collectEntryFiles(trackedFiles, entry, ignoredPaths);

  entryFileCache.set(entry, files);

  return files;
}

function readTrackedFiles(): readonly string[] {
  const rootDir = join(import.meta.dir, '..', '..', '..');

  const listing = Bun.spawnSync(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: rootDir,
  });

  return listing.stdout.toString().trim().split('\n');
}

function buildPartGlob(names: string): string {
  return `apps/server/src/part/{${names}}.ts`;
}

// A change to one of these changes every feature: the verify CLI and its harness, the test helpers
// the harness starts nixie with, and the preview recipe the `preview` target runs.
export const sharedPaths = [
  // the verify CLI and its harness, which run every journey
  'verify/**',

  // the test helpers that the harness starts nixie with
  'apps/server/src/test-utils/**',
  'apps/web/src/test-utils/**',
  'libs/testing/**',

  // the preview recipe that the `preview` target runs
  'preview/**',

  // global declarations that every package compiles against
  'bun-serve-options.d.ts',
  'nixie-test-build.d.ts',

  // The server's start file and what it wires. The walk cannot start from them, because they
  // import every module and would give each feature every file.
  'apps/server/*',
  'apps/server/src/*',
  'apps/server/src/{action,backup,budget,cli,config,conversation,credential,definition,deployment,feature,forget,leak,mocks,pause,place,prompt,proposal,queue,release,reminder,rule,sandbox,seed,server,skill,spend,task,test,triggers,turn,utils}/**',

  // the same, for the parts that no one feature owns
  'apps/server/src/part/{build-nixie-operation-schemas,build-seeding-connections,collect-host-held-names,front-part-declarations,get-sandbox-root-dir,has-breaking-marker,list-image-needs,load-start-state,make-lazy-tool-source,make-retried-start,make-step-error-logger,memory-part-declarations,missing-part-error,part-cycle-error,part-not-started-error,part-plan-error,plan-parts,register-harness-operations,register-server-record-topics,remove-swept-sandboxes,restart-sweep-part-declarations,run-restart-sweep-steps,server-inputs,server-part-declarations,server-part-values,server-record-kind,server-record-topics,start-checker,start-code-run-part,start-control-socket,start-held-credentials-part,start-host-commands,start-part-graph,start-proposal-sweeps,start-runners,start-sandbox-adapter-part,start-web-fetch-part,start-web-fetch,start-worker-part,tool-part-declarations,tools,warn-without-owner-rules,work-part-declarations}.ts',

  // the image recipes of the guests that a journey builds
  'guests/{codex,computer,conversation,fetch,render}/Dockerfile*',

  // guest files that a build script or a test loads by name
  'guests/codex/src/write-guest-bundle.ts',
  'guests/codex/src/config/*.json',
  'guests/conversation/src/{check,nixie-cli-path.d,write-guest-bundles}.ts',
  'guests/conversation/src/memory-index/run-pinned-change-turns.ts',

  // the API that routes each request to its module, so it imports every module
  'modules/api/**',

  // the web client's package files and entry points
  'apps/web/*',
  'apps/web/{icons,public}/**',
  'apps/web/src/*',
] as const;
