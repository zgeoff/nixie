# The e2e, journeys and restic lanes

Each of these 3 [lanes](../SKILL.md#runs) has a lane script that makes the builds its tests read,
then runs the tests: `bun run test:e2e`, `bun run test:journeys` and `bun run test:restic`. Start a
whole lane from the repo root with its lane script. A build helper, such as `readWebBuild`, makes
its build when the build is missing. A test that calls such a helper then spends the build's time
inside the test's own limit, and fails.

- Give a test outside `e2e/` the suffix `*.e2e.test.ts` when it reads the web build or the backup
  job's bundle. The e2e lane runs it, and the unit run leaves it out.
- Stop each process and remove each folder that a test makes. The files of a lane share one process,
  so anything a file leaves behind stays for every later file.
- To run one file again, run the build commands it needs from [Builds](#builds), then
  `bun test --timeout=<limit_ms> <path>` from the repo root. Take `<limit_ms>` from the lane's limit
  in the [Runs](../SKILL.md#runs) table, such as `15000` for 15 s. For a restic file, also set
  `NIXIE_RESTIC_BINARY`, as in [Restic](#restic). For a journey, use the command in
  [Journeys](#journeys).

## Builds

| Build                   | Build command                   | Made by lane script                                      | Read it in a test with                                       |
| ----------------------- | ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| nixie's test bundle     | `bun run test:bundles`          | `test:e2e`, `test:journeys`, and `test` for the unit run | `startSpawnedNixie` from `@heynixie/server/test-utils`       |
| the web build           | `bun run test:web-build`        | `test:e2e`                                               | `readWebBuild` from `@heynixie/web/test-utils`               |
| the backup job's bundle | `bun run test:backup-job-build` | `test:e2e`, `test:restic`                                | `readBackupJobBundle` from `@heynixie/backup-job/test-utils` |

- Pass the server entry path that `readWebBuild` returns to `startBuiltWeb`, from the same package.
- Start the backup job with `bun <bundle_path> run`. `<bundle_path>` is the path that
  `readBackupJobBundle` returns, and `run` is the job's command.
- Run a build command again after you change a file the build is made from. Each build helper keeps
  its build in a folder under `node_modules/.cache/nixie-test-bundles/`, named by a hash of those
  files, so a change leaves the build missing.
- Give `startSpawnedNixie` a `release` path only in a suite that checks the release bundle. That
  suite writes its own release bundle, as
  [`write-release-bundle.test.ts`](../../../../e2e/write-release-bundle.test.ts) does.

## Journeys

Write each core user journey, such as signing in, as a `*.test.ts` file in `e2e/journeys/`. It
drives the web app in Chrome against nixie's test bundle, within the e2e lane's 15 s limit per test.

- **Run one journey with `bun run test:journeys -t '<test name>'`.** The lane script builds nixie's
  test bundle, then runs the journeys through the browser lane's script,
  [`run-browser-lane.ts`](../../../../apps/web/src/test-utils/run-browser-lane.ts). That script
  makes its own web build and starts Chrome, so a journey never calls `readWebBuild`.
- **Add a path to the `changes` job of [`journeys.yml`](../../../../.github/workflows/journeys.yml)
  when a journey reads a file outside its paths.** CI runs the journeys there, and only on a pull
  request that changes a listed path.
- **Start each journey with
  [`startWebJourney`](../../../../e2e/src/test-utils/start-web-journey.ts).** It starts nixie, the
  web server and a proxy that serves both on one origin, as a deployment does, and opens a Chrome
  view. It stops each of them when the test finishes. After nixie exits, such as after a reset, call
  the `startServer` function it returns. That function starts nixie on the same data, and the web
  server's requests then reach the new nixie.
- **Wait for the page to hydrate before you click a submit button.** A click before hydration
  submits the form as plain HTML, and React never sees it. On a signed-in page, wait for an enabled
  `input[type=file]`: the image pickers stay disabled until the page hydrates. On any other page,
  wait for a key that starts with `_reactListening` on `document`, which React adds as it hydrates.
- **Wait on the page with `waitForPage(view, expression)`** from `@heynixie/web/test-utils`. It runs
  the expression, a string of JavaScript, in the page until it gives `true`, for up to 10 s.
- **Hold a model reply only until a reset starts.** Pass a `gate` promise in the reply to
  `journey.nixie.model.addReplies`, and resolve it once `journey.server.waitForLogEvent` sees
  `reset.started`. The reset command waits up to 30 s for each turn in flight to end, more than the
  15 s limit.
- **Raise an `online` event in the page after nixie starts again:**
  `view.evaluate("dispatchEvent(new Event('online'))")`. While nixie is down, the page waits longer
  between each try to reconnect its live record stream, up to 30 s. The event makes it try at once.

## Restic

- **Set `NIXIE_RESTIC_BINARY` to run a restic suite locally.** Each restic suite skips when neither
  `NIXIE_RESTIC_BINARY` nor `CI` is set, even with `restic` on `PATH`. Run
  `NIXIE_RESTIC_BINARY=<path-to-restic> bun run test:restic`. In a new suite, copy the skip check
  from [`backup-retention.restic.test.ts`](../../../../e2e/backup-retention.restic.test.ts).
- **Read the restic lane's result in the `rehearse` job of
  [`images.yml`](../../../../.github/workflows/images.yml).** `pr.yml` runs no restic suite.
  `images.yml` runs only on a pull request that changes a path in its `changes` job, and runs the
  lane on the restic that the backup image ships.
- **Plan each restic test around 500 ms for each restic command that opens a repository.** restic
  derives each repository key with scrypt, tuned to take that long. Keep each test, with the time
  the backup job takes, under the lane's 40 s limit.
