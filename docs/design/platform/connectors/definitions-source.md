# The definitions source

- Decisions: [0013](../../../decisions/0013-definition-versioning.md),
  [0016](../../../decisions/0016-own-interfaces.md), [0020](../../../decisions/0020-deployment.md)

A definitions source is the adapter through which nixie reads your definitions: the persona, jobs
and policy seed. A git repo, a local path and bucket storage are all valid, whatever the deployment.
Every source returns a snapshot: the files, a revision that says where they came from, and a content
hash that is the same for the same files from any source. The
[deployment design](../deployment/deployment.md) owns seeding.

## The interface, the content hash and the filter

[The definitions](../../../architecture/definitions.md#sources-and-snapshots) covers the interface,
the content hash and the filter, which every source shares. The filter reads only the known
definitions paths, so a git source lists the commit's other root entries as skipped and never reads
them. The git source skips every symlink, so no file from outside the definitions reaches the seed.

nixie calls `probe` every minute by default, and takes a snapshot only when the token changes.

## Sources

- **Git** fetches the ref shallowly into a cache repo and reads the files at the commit, with no
  working tree. Its revision is the commit. A private repo needs a read-only deploy key from the
  deployment.
- **Path** walks a directory, which suits definitions edited on the host or mounted into a
  container. [The definitions](../../../architecture/definitions.md) covers it.
- **Bucket** lists an S3-compatible bucket with each key's ETag and version ID, and reads each
  object at its listed version, so a concurrent write cannot mix 2 versions. Its probe hashes the
  keys with their ETags, and its content hash uses the bytes, because a multipart ETag is not a hash
  of the bytes. The spike never ran the bucket source.
