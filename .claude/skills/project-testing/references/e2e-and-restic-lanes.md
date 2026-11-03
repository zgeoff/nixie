# The e2e and restic lanes

Each [lane](../SKILL.md#runs) has a lane script that makes the builds its tests read, then runs the
tests: `bun run test:e2e` and `bun run test:restic`. Start a whole lane from the repo root with its
lane script. A build helper, such as `readWebBuild`, makes its build when the build is missing. A
test that calls it then spends the build's time inside its own limit, and fails.

- Name a test outside `e2e/` that reads the web build or the backup job's bundle `*.e2e.test.ts`.
  The e2e lane runs it, and the unit run leaves it out.
- Stop each process and remove each folder that a test makes. The files of a lane share one process,
  so anything a file leaves behind stays for every later file.
- To run one file again, run the build commands it needs from [Builds](#builds), then
  `bun test --timeout=<limit_ms> <path>` from the repo root, with the lane's limit in ms, such as
  `15000`. For a restic file, also set `NIXIE_RESTIC_BINARY`, as in [Restic](#restic).

## Builds

| Build                   | Build command                   | Made by lane script       | Read it in a test with                                       |
| ----------------------- | ------------------------------- | ------------------------- | ------------------------------------------------------------ |
| nixie's test bundle     | `bun run test:bundles`          | `test:e2e`, the unit run  | `startSpawnedNixie` from `@heynixie/server/test-utils`       |
| the web build           | `bun run test:web-build`        | `test:e2e`                | `readWebBuild` from `@heynixie/web/test-utils`               |
| the backup job's bundle | `bun run test:backup-job-build` | `test:e2e`, `test:restic` | `readBackupJobBundle` from `@heynixie/backup-job/test-utils` |

- Pass the server entry path that `readWebBuild` returns to `startBuiltWeb`, from the same package.
- Start the backup job with `bun <bundle_path> run`, where `<bundle_path>` is the path that
  `readBackupJobBundle` returns and `run` is the job's command.
- Run a build command again after you change a file the build is made from. Each build helper keeps
  its build in a folder under `node_modules/.cache/nixie-test-bundles/`, named by a hash of those
  files, so a change leaves the build missing.
- Give `startSpawnedNixie` a `release` path only in a suite that checks the release bundle. That
  suite writes its own release bundle, as
  [`write-release-bundle.test.ts`](../../../../e2e/write-release-bundle.test.ts) does.

## Restic

- **Set `NIXIE_RESTIC_BINARY` to run a restic suite locally.** Each restic suite skips when neither
  `NIXIE_RESTIC_BINARY` nor `CI` is set, even with `restic` on `PATH`. Run
  `NIXIE_RESTIC_BINARY=<path-to-restic> bun run test:restic`. In a new suite, copy the skip check
  from [`backup-retention.restic.test.ts`](../../../../e2e/backup-retention.restic.test.ts).
- **Read the restic lane's result in the `rehearse` job of
  [`images.yml`](../../../../.github/workflows/images.yml).** The checks in `pr.yml` leave the
  restic lane out. `images.yml` runs only on a pull request that changes a path in its `changes`
  job, and runs the lane on the restic that the backup image ships.
- **Plan each restic test around about 500 ms for each restic command that opens a repository.**
  restic derives each repository key with scrypt, tuned to take that long. Keep each test, with the
  time the backup job takes, under the lane's 40 s limit.
