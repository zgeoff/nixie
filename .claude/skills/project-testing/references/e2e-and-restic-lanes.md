# The e2e and restic lanes

Start a whole lane through its lane script, `bun run test:e2e` or `bun run test:restic`, from the
repo root. The [Runs](../SKILL.md#runs) table gives each lane's files and limit. Name a test outside
`e2e/` that reads one of the builds below `*.e2e.test.ts`, so it runs in the e2e lane. The lane
script makes the builds that the tests run before the tests start. When a build is missing, the
first test that needs it makes it, and that test runs past its limit. Clean up each process and
folder a test makes, because the files of a lane share one process.

To run one file again, run its lane script once, then `bun test --timeout=<limit_ms> <path>` from
the repo root. For a restic file, set `NIXIE_RESTIC_BINARY` first, as in [Restic](#restic).

## Builds

Each lane script makes its builds with the root `package.json` scripts below, and
[`createRunTemplate`](../../../../libs/testing/src/create-run-template.ts) keeps each build in a
folder under `node_modules/.cache/nixie-test-bundles/`. A lane script makes a build again only when
one of the files it is made from changes.

| Build                   | Made by                         | Use it in a test                                                                                   |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| nixie's test bundle     | `bun run test:bundles`          | `startSpawnedNixie` from `@heynixie/server/test-utils` starts it                                   |
| the web build           | `bun run test:web-build`        | pass the path from `readWebBuild` in `@heynixie/web/test-utils` to `startBuiltWeb`                 |
| the backup job's bundle | `bun run test:backup-job-build` | run the path from `readBackupJobBundle` in `@heynixie/backup-job/test-utils` with `bun <path> run` |

- Leave `startSpawnedNixie` on the test bundle. Give it a `release` path only in a suite that checks
  the release bundle itself, such as
  [`write-release-bundle.test.ts`](../../../../e2e/write-release-bundle.test.ts).

## Restic

- **Set `NIXIE_RESTIC_BINARY` to run a restic suite locally.** Each restic suite skips when neither
  `NIXIE_RESTIC_BINARY` nor `CI` is set, even with `restic` on `PATH`. Run
  `NIXIE_RESTIC_BINARY=<path-to-restic> bun run test:restic`. In a new suite, copy the skip check
  from [`backup-retention.restic.test.ts`](../../../../e2e/backup-retention.restic.test.ts).
- **Read the restic lane's result in the `rehearse` job of
  [`images.yml`](../../../../.github/workflows/images.yml).** The checks in `pr.yml` leave the
  restic lane out. The Images workflow runs on a pull request that changes the files its `changes`
  job lists, and runs the lane on the restic that the backup image ships.
- **Count about 500 ms for each restic command that opens a repository.** restic derives each
  repository key with scrypt, tuned to take that long. Keep each test, the backup job's run
  included, under the lane's 40 s limit. Never set a timeout in the test.
