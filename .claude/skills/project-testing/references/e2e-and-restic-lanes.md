# The e2e, bundle, journeys and restic lanes

Write and run the tests that read a build: nixie's test bundle, the previous release's bundle, the
web build or the backup job's bundle. Each lane's command makes the builds its tests read before the
tests start. When you run one file without its lane's command, make each build it reads first. A
build helper, such as `readWebBuild`, makes a missing build itself, inside the test's own time
limit, and a build takes longer than that limit, so the test fails.

| Lane     | Files                                                                     | Command                 |
| -------- | ------------------------------------------------------------------------- | ----------------------- |
| e2e      | the root `e2e/` folder, except `*.browser.test.ts` and `*.restic.test.ts` | `bun run test:e2e`      |
| bundle   | `*.bundle.test.ts`, outside the root `e2e/` folder                        | `bun run test:bundle`   |
| journeys | `*.browser.test.ts` in `e2e/journeys/`                                    | `bun run test:journeys` |
| restic   | `*.restic.test.ts` in the root `e2e/` folder                              | `bun run test:restic`   |

Run each command from the repo root. rig, the test runner `@zgeoff/rig`, runs the bundle, journeys
and restic lanes. rig does not run the root `e2e/` folder, so `bun run test:e2e` runs that folder
through `bun test` with a limit of 15 s per test. It then runs the bundle lane through
`bun run test:bundle`.

- Outside the root `e2e/` folder, give a test that reads the web build or the backup job's bundle
  the suffix `*.bundle.test.ts`. Give a test there that reads only nixie's test bundle the plain
  `*.test.ts` suffix. `bun run test` runs the unit tests, and builds that bundle first.
- Stop each process and remove each folder that a test makes. The files of a lane share one process,
  so anything a file leaves behind stays for every later file.
- To run one bundle or restic file again, pass its path: `bun run test:bundle <path>` or
  `bun run test:restic <path>`. Before the tests, rig runs the lane's start hook, a script in
  `scripts/test-utils/` that [`rig.config.ts`](../../../../rig.config.ts) names, and the hook makes
  the lane's builds. For a restic file, also set `NIXIE_RESTIC_BINARY`, as in [Restic](#restic). For
  a journey, use the command in [Journeys](#journeys).
- To run one file of the e2e lane again, run the build commands it needs from [Builds](#builds),
  then `bun test --timeout=15000 <path>`.

## Builds

| Build                   | Build command                         | Read it in a test with                                        |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------- |
| nixie's test bundle     | `bun run test:bundles`                | `startSpawnedNixie` from `@heynixie/server/test-utils`        |
| the previous release    | `bun run test:previous-release-build` | `readPreviousReleaseBuild` from `@heynixie/server/test-utils` |
| the web build           | `bun run test:web-build`              | `readWebBuild` from `@heynixie/web/test-utils`                |
| the backup job's bundle | `bun run test:backup-job-build`       | `readBackupJobBundle` from `@heynixie/backup-job/test-utils`  |

`bun run test:bundles`, with an `s`, builds nixie's test bundle. `bun run test:bundle` runs the
bundle lane. A file needs each build whose function in the last column it imports.

- Pass the server entry path that `readWebBuild` returns to `startBuiltWeb`, from the same package.
  A journey reads the browser lane's own web build instead: see [Journeys](#journeys).
- Start the backup job with `bun <bundle_path> run`. `<bundle_path>` is the path that
  `readBackupJobBundle` returns, and `run` is the job's command.
- Run a build command again after you change a file the build is made from. Each build helper keeps
  its build in a folder under `node_modules/.cache/nixie-test-bundles/`, named by a hash of those
  files, so a change leaves the build missing.
- Give `startSpawnedNixie` a `release` path only in a suite that checks the release bundle. The
  release bundle is the one nixie ships, with the test-only code left out. The `release` path is the
  bundle's entry file. The suite writes its own release bundle, as
  [`write-release-bundle.test.ts`](../../../../e2e/write-release-bundle.test.ts) does.
- To check that the previous release starts on data the checked-out code wrote, write a test in the
  root `e2e/` folder, as [`previous-release.test.ts`](../../../../e2e/previous-release.test.ts)
  does. The previous release is the newest `v*` tag reachable from `HEAD`, other than a tag on
  `HEAD` itself. With no such tag, `readPreviousReleaseBuild` throws.
  1. Pass the `entry` that `await readTestBundle(false)` returns, the checkout's release bundle, to
     `startSpawnedNixie` as its `release` path. It writes the config and returns `nixie` without
     starting a process.
  2. Start the checkout with `nixie.harness.start()`, and wait for its `http.listening` log event.
     The database is open by then.
  3. Send the process SIGTERM. Expect: it exits with code 0.
  4. Start the previous release on the same config and data directory with
     `nixie.harness.startRelease(entry)`. `entry` is the path that `readPreviousReleaseBuild`
     returns. Expect: its `http.listening` event, or an exit before it.
- Make the previous release's bundle before such a test with `bun run test:previous-release-build`.
  The build lives in
  [`read-previous-release-build.ts`](../../../../apps/server/src/test-utils/read-previous-release-build.ts).
  Of the lane commands, only `bun run test:e2e` runs it first. Its cache folder is named by the tag,
  so a new `v*` tag, or a change to that file, leaves the build missing.

## Journeys

Write each journey the user takes through the web app as a `*.browser.test.ts` file in
`e2e/journeys/`. Examples are signing in, sending a message, approving a memory proposal, and a
reset. A journey drives the web app in Chrome against nixie's test bundle. `bun run test:journeys`
runs them with rig's browser runner, the one the [browser lane](./browser-lane.md) uses, and its
limit of 10 s per test. `bun run test:e2e` and `bun run test:browser` leave the journeys out.

- **Run one journey with `bun run test:journeys --test-name-pattern='<test name>'`.** With
  `-t '<test name>'`, rig reads `<test name>` as a path, because it has no leading `-`, and the
  filter does not select a test. The script builds nixie's test bundle, then runs the browser lane,
  which makes its own web build and starts Chrome. A journey never calls `readWebBuild`.
- **Add a path to the `changes` job of [`journeys.yml`](../../../../.github/workflows/journeys.yml)
  when a journey reads a file outside the job's paths.** CI runs the journeys there, and only on a
  pull request that changes a listed path.
- **Start each journey with
  [`startWebJourney`](../../../../e2e/src/test-utils/start-web-journey.ts).** It starts nixie, the
  web server and a proxy that serves both on one origin, as a deployment does, and opens a Chrome
  view. It stops each of them when the test finishes. Read the fields of the journey it returns in
  its `WebJourney` type. `journey.server` is the first nixie process, never the web server. After
  nixie exits, such as after a reset, call `journey.startServer`. It starts a new nixie process on
  the same data and returns it, and the web server's requests then reach that process.
- **Wait for the page to hydrate before you click a submit button.** A click before hydration
  submits the form as plain HTML, and React never sees it. On the conversation page, wait for an
  enabled `input[type=file]`: the image pickers stay disabled until the page hydrates. On any other
  page, wait with `waitForPage` for a key that starts with `_reactListening` on `document`, which
  React adds as it hydrates.
- **Wait on the page with `waitForPage(view, expression)`** from `@heynixie/web/test-utils`. It runs
  the expression, a string of JavaScript, in the page until it gives `true`. After 5 s it throws an
  error that holds the expression, so you see a failed wait before the 10 s limit ends the test.
  Keep any `timeoutMs` you pass under that limit too.
- **In a journey that resets during a turn, hold the model reply only until the reset starts.** Pass
  the reply as `{ text, gate }` to `journey.nixie.model.addReplies`, where `gate` is a promise.
  Resolve it once `journey.server.waitForLogEvent('reset.started')` returns. The reset command waits
  up to 30 s for each turn in flight to end, more than the 10 s limit.
- **Raise an `online` event in the page after nixie starts again:**
  `view.evaluate("dispatchEvent(new Event('online'))")`. While nixie is down, the page waits longer
  between each try to reconnect to nixie's stream of new records, up to 30 s. The event makes it try
  at once.

## Restic

- **Set `NIXIE_RESTIC_BINARY` to run a restic suite locally.** Each restic suite skips when neither
  `NIXIE_RESTIC_BINARY` nor `CI` is set, even with `restic` on `PATH`. Run
  `NIXIE_RESTIC_BINARY=<path-to-restic> bun run test:restic`. In a new suite, copy the skip check
  from [`backup-retention.restic.test.ts`](../../../../e2e/backup-retention.restic.test.ts).
- **Read the restic lane's result in the `rehearse` job of
  [`images.yml`](../../../../.github/workflows/images.yml).** `pr.yml` does not run a restic suite.
  `images.yml` runs only on a pull request that changes a path in its `changes` job, and runs the
  lane on the restic that the backup image ships.
- **Plan each restic test around 500 ms for each restic command that opens a repository.** restic
  derives each repository key with scrypt, tuned to take that long. Keep each test, with the time
  the backup job takes, under the lane's 40 s limit.
