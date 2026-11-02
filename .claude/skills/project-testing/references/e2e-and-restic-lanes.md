# The e2e and restic lanes

The e2e lane drives the built nixie, the web client and the backup job from outside, through the
suites under `e2e/`. The restic lane, the `*.restic.test.ts` suites under `e2e/`, runs the backup
job against the restic binary that the backup image carries. Run them with `bun run test:e2e` and
`bun run test:restic` from the repo root. Each script runs its files one after another in one test
process.

## Traps

- **Start the e2e suites only through `bun run test:e2e`.** Before its tests start, the script fills
  the server's test bundle, the web client's build and the backup job's bundle as run templates
  through [`createRunTemplate`](../../../../libs/testing/src/create-run-template.ts). A spawned
  nixie starts from the test bundle unless its suite passes a release bundle, because a start from
  source transpiles the whole server. The web suites read the web build, because a build takes
  longer than a test's limit on a host with 2 cores.
- **Run the backup job from its bundle.** Every suite that runs the job runs the bundle that
  [`readBackupJobBundle`](../../../../e2e/test-utils/read-backup-job-bundle.ts) reads, as the image
  does.
- **Point a local restic run at a restic binary.** A restic suite takes its binary from
  `NIXIE_RESTIC_BINARY`, or from `restic` on `PATH` when that variable is unset. It skips when
  neither `NIXIE_RESTIC_BINARY` nor `CI` is set, so run it locally with
  `NIXIE_RESTIC_BINARY=<path-to-restic> bun run test:restic`.
- **Read the restic lane's result in the Images workflow.** The `rehearse` job of
  [`images.yml`](../../../../.github/workflows/images.yml) copies restic out of the backup image it
  built and runs the lane on it, so the lane checks the binary that ships.
- **Expect each restic command to take about 500 ms.** restic derives each repository key with
  scrypt, which it tunes to that time, so the lane's limit for each test is about twice the slowest
  restic test's time on a CI run.
