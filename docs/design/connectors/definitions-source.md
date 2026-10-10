# The definitions source

- Decisions: [0013](../../decisions/0013-definition-versioning.md),
  [0016](../../decisions/0016-own-interfaces.md), [0020](../../decisions/0020-deployment.md)

A definitions source is the adapter through which nixie reads your definitions: the persona, jobs
and policy seed. A git repo, a local path and bucket storage are all valid, whatever the deployment.
Every source returns a snapshot: the files, a revision that says where they came from, and a content
hash that is the same for the same files from any source. The
[deployment design](../deployment/deployment.md) owns seeding.

## The interface

```ts
interface DefinitionsSource {
  id: string;
  kind: 'bucket' | 'git' | 'path';
  probe(): Promise<string>; // a token that changes when the definitions change
  snapshot(): Promise<Snapshot>;
}

interface Snapshot {
  contentHash: string; // the same for the same files, whatever the source
  files: Map<string, Uint8Array>; // paths relative to the definitions root, with '/' separators
  revision: string; // the commit for git, the content hash for a path or a bucket
  skipped: string[]; // paths the filter left out, for the seed's record
}
```

nixie calls `probe` every minute by default, and takes a snapshot only when the token changes. The
seed records the source's ID, the revision and the content hash.

## The content hash

The content hash is a SHA-256 over a version line, `nixie-definitions-v1`, then one line per file in
path order: the path, its byte length and its own SHA-256. Every source turns CRLF line endings into
LF first. Git metadata, mode bits and file times never enter the hash. **Why:** a git commit and a
checkout of it, on any platform, give the same hash, as the
[definitions source spike](../../../spikes/definitions-source/README.md) showed. The snapshot hash
on every record is a different hash, over the definitions in force in the database, which the
[rules design](../policy/rules.md) defines.

## What a source reads

Every source applies one filter:

- only files under the definitions root
- only `.md`, `.yaml`, `.yml` and `.json` files
- no path with a part that starts with a dot, such as `.git`
- at most 1 MiB per file and 10 MiB in all, by default, past which the snapshot fails with the paths
  that broke the limit

The path source fails at a symlink that leads outside the root and skips one inside it, and the git
source skips every symlink, so no file from outside the definitions reaches the seed.

## Sources

- **Git** fetches the ref shallowly into a cache repo and reads the files at the commit, with no
  working tree. Its revision is the commit. A private repo needs a read-only deploy key from the
  deployment.
- **Path** walks a directory, which suits definitions edited on the host or mounted into a
  container.
- **Bucket** lists an S3-compatible bucket with each key's ETag and version ID, and reads each
  object at its listed version, so a concurrent write cannot mix 2 versions. Its probe hashes the
  keys with their ETags, and its content hash uses the bytes, because a multipart ETag is not a hash
  of the bytes. The spike never ran the bucket source.
