# The definitions source

- Status: Proposed
- Decisions: [0030](../../decisions/0030-connectors-and-sandbox-environments.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0016](../../decisions/0016-own-interfaces.md), [0020](../../decisions/0020-deployment.md)

A definitions source is the adapter through which nixie reads an owner's definitions: the persona,
jobs and policy seed, under [0020](../../decisions/0020-deployment.md). A git repo, a local path and
bucket storage are all valid sources, and the choice does not depend on how nixie is deployed. Every
source returns a snapshot: the files, a revision that points at where they came from, and a content
hash that is the same for the same files whatever the source. Seeding, and when it runs, belong to
the deployment design. Everything in this doc beyond the decisions it links is a proposal.

## The interface

The [definitions source spike](../../../spikes/definitions-source/README.md) ran this shape against
a git repo and a local directory:

```ts
interface DefinitionsSource {
  id: string;
  kind: 'bucket' | 'git' | 'path';
  probe(): Promise<string>; // a cheap token that changes when the definitions change
  snapshot(): Promise<Snapshot>;
}

interface Snapshot {
  contentHash: string; // the same for the same files, whatever the source
  files: Map<string, Uint8Array>; // paths relative to the definitions root, with '/' separators
  revision: string; // the commit for git, the content hash for a path or a bucket
  skipped: string[]; // paths the filter left out, for the seed's record
}
```

nixie calls `probe` on an interval, 1 min by default, and takes a snapshot only when the token
changes. The seed records the source's ID, the revision and the content hash, so a rule seeded from
the repo records its commit, as [0020](../../decisions/0020-deployment.md) requires.

## The content hash

The content hash is a SHA-256 over a version line, `nixie-definitions-v1`, then one line per file,
sorted by path: the path, its byte length, and its own SHA-256. Git metadata, mode bits and file
times never enter it. **Why:** the same definitions must give the same hash from a git commit and
from a checkout of that commit, so the hash depends on the files alone. In the spike, a git snapshot
and a path snapshot of the same 49 files gave the same hash, and an uncommitted edit in the
directory changed it.

Both sources turn CRLF line endings into LF before hashing and before anything parses a file.
**Why:** a checkout on Windows with line-ending conversion would otherwise hash differently from the
commit it came from, and in the spike the same persona file with CRLF endings hashed differently as
raw bytes and the same once converted.

The content hash identifies the seed's input. The snapshot hash on every record covers the
definitions in force in the database, seeded and runtime rules together, under
[0013](../../decisions/0013-definition-versioning.md), and the
[rules design](../policy/rules.md#the-snapshot-hash) defines it.

## What a source reads

Every source applies one filter, so the same files reach the seed from any source:

- only files under the definitions root, with paths relative to it
- only `.md`, `.yaml`, `.yml` and `.json` files
- no path with a part that starts with a dot, such as `.git` or `.github`
- at most 1 MiB per file and 10 MiB in all, by default, past which the snapshot fails with the paths
  that broke the limit

The path source stops with an error at a symlink that leads outside the root, and skips one that
stays inside. The git source skips every symlink. **Why:** a symlink could pull a file from outside
the definitions into the seed, and neither source has a reason to follow one.

## Sources

| Source | Revision         | Probe                                      | Snapshot in the spike |
| ------ | ---------------- | ------------------------------------------ | --------------------- |
| Git    | The commit       | Fetch the ref, read its commit: about 8 ms | 12 to 16 ms           |
| Path   | The content hash | Hash the files: 0.5 ms                     | 0.7 ms                |
| Bucket | The content hash | Hash the listed keys with their ETags      | Not run               |

**The git source** fetches the ref shallowly into a cache repo and reads the files at the commit
with 2 git commands, with no working tree. A deployment can pin a commit by its SHA, and a host that
refuses a fetch by SHA needs the branch fetched and the commit checked against it. A private repo
needs a read-only deploy key or token, which the [credential store](./credentials.md#backends) holds
in the deployment backend.

**The path source** walks a directory, which suits an owner who edits definitions on the host or
mounts them into a container.

**The bucket source** lists an S3-compatible bucket, with each key's ETag and version ID, and reads
each object at its listed version ID, so a write during the read cannot mix 2 versions. Its probe
hashes the sorted keys with their ETags, and its content hash uses the bytes like the other sources,
because a multipart upload has an ETag that is not a hash of its bytes. The bucket source is a
sketch, and the spike never ran it.
