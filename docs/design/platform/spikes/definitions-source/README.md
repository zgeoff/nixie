# Spike: one definitions source for a git repo and a local path

This spike reads an owner's definitions through one interface from 2 sources: a git repo, read at a
commit without a working tree, and a local directory. Both sources hash the same canonical listing
of the files, so the same definitions give the same content hash whatever the source, and the
snapshot hash under [decision 0013](../../../../decisions/0013-definition-versioning.md) does not
depend on where the definitions came from. A git snapshot of 49 files took 12 to 16 ms from a local
remote, and checking the remote for a new commit took about 8 ms.

## Question

Can one definitions source interface read the definitions from a git repo and from a local path, and
give the same content hash for the same definitions whatever the source? What does each source cost
to read and to check for a change?

## Versions

| Component | Version |
| --------- | ------- |
| Bun       | 1.4.2   |
| git       | 2.55.0  |

The spike has no dependencies.

## Setup

[`sources.ts`](sources.ts) holds the interface and 2 adapters:

```ts
interface DefinitionsSource {
  id: string;
  kind: 'bucket' | 'git' | 'path';
  probe: () => Promise<string>; // a cheap token that changes when the definitions change
  snapshot: () => Promise<Snapshot>;
}

interface Snapshot {
  contentHash: string; // the same for the same files, whatever the source
  files: Map<string, Uint8Array>; // paths relative to the definitions root, with '/' separators
  revision: string; // the commit for git, the content hash for a path
  skipped: string[]; // paths the filter left out
}
```

- **The git source** fetches one ref, a branch or a commit, with `--depth=1` into a bare cache repo,
  lists the commit with `git ls-tree -r -z`, and reads every wanted blob in one
  `git cat-file --batch` call. It never checks out a working tree. Its `probe` fetches and returns
  the commit.
- **The path source** walks a directory. It skips dotfiles and dot directories, `.git` among them,
  and refuses a symlink whose target leaves the root. Its `probe` is the content hash.
- **The filter** keeps files with an allowed extension (`.json`, `.md`, `.yaml`, `.yml` in the run)
  under a definitions root, and drops every path with a part that starts with a dot.

The content hash is a sha256 over a listing with one line per file, sorted by path: the path, the
byte length and the file's own sha256, under a version line `nixie-definitions-v1`. Git metadata,
mode bits and mtimes never enter it. Every allowed extension is text, so both sources turn CRLF line
endings into LF before hashing, and the parser sees the same LF bytes.

[`run.ts`](run.ts) builds a throwaway bare repo standing in for the owner's git host, with a
persona, 24 jobs, 24 rules, and 3 files the filter must drop: `README.txt`, `.github/workflow.yaml`
and `scripts/seed.sh`. It reads the repo over a `file://` URL through the git source and the pushed
checkout through the path source, runs 7 checks, and removes its scratch directory.

The bucket source is a sketch in a comment, never run: a list call on an S3-compatible bucket gives
each key with its ETag and version ID, `probe` hashes the sorted key and ETag pairs, and `snapshot`
reads each object at its listed version ID, so a write during the read cannot mix 2 versions, and
hashes the bytes like the other sources. A multipart upload has an ETag that is not an MD5 of the
bytes, so the content hash never uses ETags.

## Run it

```bash
cd docs/design/platform/spikes/definitions-source
SPIKE_WORK=<scratch_dir> bun run.ts
```

## Results

Output of one run:

```text
== 1. the same commit through both sources
git first snapshot (init, fetch, read): 16.4 ms
git second snapshot (fetch, read): 11.8 ms
path snapshot: 0.7 ms
files: git 49, path 49
git revision cbeb254dff9b, hash 359ea86071b0776843c4f16206daa0acfea7c4d662b7db960750e14d9267cb8e
path revision 359ea86071b0, hash 359ea86071b0776843c4f16206daa0acfea7c4d662b7db960750e14d9267cb8e
hashes match: true
second git snapshot matches: true
git skipped: .github/workflow.yaml, README.txt, scripts/seed.sh
path skipped: .git, .github, README.txt, scripts/seed.sh
== 2. CRLF line endings in the path source
raw bytes hash matches git: false
normalised hash matches git: true
== 3. an uncommitted change in the path source
hash differs from the commit: true
== 4. a symlink that leaves the root
path snapshot: refused: symlink leaves the root: escape
== 5. a root narrower than the repo
files under rules/: 24, first path rule-0.yaml
matches a path source on rules/: true
== 6. change detection
git probe, no change: 8.1 ms, same: true
git probe after a push: 8.7 ms, changed: true
path probe: 0.5 ms, changed: true
after the push, hashes match: true
== 7. a pinned commit
pinned commit read, hash matches the first: true
```

The commit SHA differs between runs, because the commit time changes. The content hash stays the
same, because it holds only paths and bytes.

## Answers

- **One interface serves both sources.** The git source and the path source returned the same 49
  files and the same content hash for the same commit, and again after a push that added a job.
- **The hash follows the definitions, not the source.** The git commit and the content hash are
  different values for the same files, so each record carries the content hash as the definitions
  hash, and the commit as a reference to where the files came from. A path source has no commit, so
  its revision is the content hash itself.
- **Paths are relative to the definitions root.** A git source rooted at `rules/` and a path source
  pointed at the `rules` directory hashed alike, because both list `rule-0.yaml` rather than
  `rules/rule-0.yaml`.
- **Line endings are normalised.** The same persona with CRLF endings hashed differently as raw
  bytes and alike once normalised. A checkout with `core.autocrlf` on Windows writes CRLF while the
  commit holds LF, so without normalisation the same commit would give 2 hashes. Normalising before
  the parser too keeps the hash a hash of what nixie reads.
- **An uncommitted edit changes the hash,** so a path source shows a local change as a new
  definitions version, with no commit to name it.
- **Change detection is cheap for both.** A git probe is one shallow fetch and a `rev-parse`, about
  8 ms against a local remote whether or not the ref moved. A path probe reads and hashes every
  file, 0.5 ms for 49 small files.
- **A pinned commit works.** The git source fetched a commit by its SHA and gave the first hash
  again, so a deployment can pin definitions to a commit as well as follow a branch.
- **The filter guards the root.** Files outside the root, with another extension, or under a dot
  directory never enter the snapshot, and a symlink that leaves the root stops the path source with
  an error rather than a silent skip.

## Untested

- A real git host over HTTPS or SSH, its credentials, and its latency: every fetch went to a
  `file://` remote on the same disk. Fetching a commit by SHA works on GitHub and GitLab, and a host
  that refuses it would need the branch fetched and the commit checked against it.
- The bucket source, which stays a sketch.
- Large definitions: the run read 49 files of under 100 bytes each.
- A symlink inside the git tree: the git source skips every symlink (mode `120000`), while the path
  source follows one that stays inside the root only to skip it. Neither reads a symlinked file.
- Non-UTF-8 text: normalisation decodes and re-encodes as UTF-8, which would change other encodings.
