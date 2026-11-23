# The definitions source

A definitions source is the adapter through which nixie reads your definitions: the persona, jobs
and policy seed. The one source is a local path, such as a directory that a git-sync sidecar keeps
current. Every source returns a snapshot: the files, a revision that records where they came from,
and a content hash that is the same for the same files from any source. The
[deployment design](../deployment/deployment.md) owns seeding.

## The interface, the content hash and the filter

[The definitions](../../../architecture/core/definitions.md#sources) covers the interface, the
content hash and the filter. The filter reads only the known definitions paths, so the source lists
the other root entries as skipped and never reads them. The source skips every symlink, so no file
from outside the definitions reaches the seed.

nixie calls `probe` every 5 minutes by default (`probe_interval_ms`), and takes a snapshot only when
the token changes.

## The path source

The path source walks a directory, which suits definitions edited on the host or mounted into a
container. [The definitions](../../../architecture/core/definitions.md) covers it.
