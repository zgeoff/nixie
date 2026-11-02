# The e2e and restic lanes

The e2e lane's script builds what its suites run before its tests start. It runs
`bun run test:bundles`, then `bun run test:web-build` and `bun run test:backup-job-build`, which
write the server's test bundle, the web client's build and the backup job's bundle to
`node_modules/.cache/nixie-test-bundles` through
[`createRunTemplate`](../../../../libs/testing/src/create-run-template.ts). Every spawned nixie
starts from the test bundle, because a start from source transpiles the whole server. The web suites
read the web build, because a build takes longer than a test's limit on a host with 2 cores. Every
suite that runs the backup job runs its bundle, as the image does.

The restic lane runs in the Images workflow, against the restic binary that the backup image
carries, and its script builds the backup job's bundle first. A local run skips its suites unless
`NIXIE_RESTIC_BINARY` names a restic. Each restic command derives its repository key with scrypt,
which restic tunes to take 500 ms, so the lane's limit holds about twice the time its suite measured
on CI.
