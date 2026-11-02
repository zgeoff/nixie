# The e2e and restic lanes

Before its tests start, the `test:e2e` script fills the web client's build and the backup job's
bundle as run templates, in the cache that holds the server's test bundle, through
[`createRunTemplate`](../../../../libs/testing/src/create-run-template.ts). A spawned nixie starts
from the test bundle unless its suite passes a release bundle, because a start from source
transpiles the whole server. The web suites read the web build, because a build takes longer than a
test's limit on a host with 2 cores. Every suite that runs the backup job runs its bundle, as the
image does.

The restic lane runs in [`images.yml`](../../../../.github/workflows/images.yml), against the restic
binary that the backup image carries, and its script builds the backup job's bundle first. A restic
suite takes its binary from `NIXIE_RESTIC_BINARY`, or from `restic` on `PATH` when that variable is
unset. It skips when neither `NIXIE_RESTIC_BINARY` nor `CI` is set, so a local run needs this
command:

```bash
NIXIE_RESTIC_BINARY=<path-to-restic> bun run test:restic
```

Each restic command derives its repository key with scrypt, which restic tunes to take 500 ms, so
the lane's limit for each test is about twice the slowest restic test's time on a CI run.
