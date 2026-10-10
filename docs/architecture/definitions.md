# The definitions

`modules/definitions` reads your definitions from a definitions source, seeds the persona into the
database, and computes the snapshot hash that every record carries. A source returns a snapshot of
files with a content hash. The seed parses the snapshot and puts its persona in force under a
snapshot hash. The content hash covers the source files, and the snapshot hash covers the
definitions in force, so the 2 hashes differ for the same files. The path source is the one source
built, and it lives in the module because it reaches nothing outside nixie.

## Sources and snapshots

A `DefinitionsSource` has an ID, a kind, a `probe` and a `snapshot`. The probe returns a token that
changes when the definitions change, so a poll takes a snapshot only on a new token. A snapshot
holds the files by path relative to the definitions root, with `/` separators, a revision, the
content hash and the paths the filter skipped.

`createPathSource` walks a directory. Its revision and its probe token are both the content hash,
because a directory has no commit. Its ID is `path:` plus the resolved directory, so `defs` and
`defs/` name one source.

### What a source reads

`isDefinitionsPath` holds the filter every source applies:

- no path with a part that starts with a dot, such as `.git`
- under `skills/`, every file, whatever its extension
- elsewhere, only `.md`, `.yaml`, `.yml` and `.json` files

**Why:** a skill brings its scripts, such as `fill.py`, as the
[skills design](../design/platform/skills.md#the-definitions-filter-under-skills) sets out. Every
kept file must decode as UTF-8, so a binary file under `skills/` fails the snapshot.

The path source skips a dotted directory without entering it. A symlink that stays inside the root
is skipped, and a symlink that leads outside the root, or resolves nowhere, fails the snapshot with
`SnapshotError`. **Why:** no file from outside the definitions reaches the seed.

The path source checks each kept file again when it reads it, because a file can change after the
walk. Its directory must still resolve inside the root, it opens with `O_NOFOLLOW`, and its size
comes from the open handle. A file that fails one of these checks fails the snapshot.

The snapshot fails with `SnapshotError` past either size limit in `defaultSizeLimits`: 1 MiB per
file and 10 MiB over every kept file. The error lists every file past the per-file limit, or every
file from the one that crossed the total, in path order. Skipped files never count towards the
total.

### The content hash

`buildContentHash` takes a SHA-256 over the version line `nixie-definitions-v1`, then one line per
file in path order: the path, its byte length and its own SHA-256. Every source turns CRLF line
endings into LF with `normalizeLineEndings` before it hashes. Git metadata, mode bits and file times
never enter the hash. **Why:** a git commit and a checkout of it, on any platform, give the same
hash, as the [definitions source spike](../design/platform/spikes/definitions-source/README.md)
showed.

## The definitions format

`parseDefinitions` reads 2 files from a snapshot:

- `nixie.yaml`, the manifest, whose `format` field holds the definitions format version
- `persona.md`, the persona, which must be UTF-8 text and not blank

This release writes format 1, and reads its own format and the one before. A manifest with any other
format fails with the formats the release reads. **Why:** an image upgrade and a definitions change
land in separate repos, in either order.

The seed applies no other file, and lists each one as unapplied, such as a rule file or a skill.
Each unapplied YAML or JSON file must still parse. A file that is not UTF-8, or fails to parse,
fails the whole snapshot with `DefinitionsParseError`, which lists each file and its fault.

## The snapshot hash

`buildDefinitionsSnapshot` builds the canonical form of the definitions in force, and the snapshot
hash is the SHA-256 of that form:

- **The persona** normalises with `normalizeInstructions` to Unicode NFC with LF line endings, no
  byte order mark and exactly one final newline. Trailing spaces stay, because 2 of them end a
  markdown line with a break. The persona enters the form by its own SHA-256, its persona version.
- **Jobs** form an empty list, because no job seeds yet.
- **Policy** holds the rules sorted by ID and the tool declarations sorted by name. Each tool's
  effect list sorts and drops duplicates. A duplicate rule ID or tool name throws.
- **Objects** serialise through `toCanonicalJSON`, with sorted keys and no whitespace.

The caller passes the policy in. It holds the fixed rule, the test rule in a test build, and every
tool declaration in the registry. **Why:** the fixed rule decides by a tool's declared effects, so a
replay needs the declarations in force. A release that changes a tool declaration therefore changes
the snapshot hash over the same files.

## Seeding

`runSeed` takes a snapshot, parses it, builds the snapshot hash and seeds it in one write
transaction. The transaction writes 4 things, and they commit together or not at all:

1. the persona in `personas`, under its persona version
2. the snapshot in `definition_snapshots`, under its snapshot hash, with the canonical form, the
   policy hash and the revision as its label
3. a `definitions_seeded` record, through `writeRecordsInTransaction`
4. a row in `definition_seeds` with the source ID and kind, the revision, the content hash, the
   format version, the snapshot hash and the record's sequence

A persona or a snapshot seen before keeps its first row, and with it its first label. The record
carries the new snapshot hash and persona version, and its payload holds the source, the revision,
the content hash, the format version, the policy hash, the unapplied files and the skipped paths.

`runSeed` returns one of 3 results:

| Status      | When                                                                      | Writes  |
| ----------- | ------------------------------------------------------------------------- | ------- |
| `seeded`    | The source, revision, content hash or snapshot hash differs from the last | 4 rows  |
| `unchanged` | The newest seed holds the same source, revision and both hashes           | Nothing |
| `refused`   | The snapshot failed to read, parse or validate                            | Nothing |

A refused snapshot comes back as a value with its error and the definitions still in force, and is
never thrown. **Why:** a half-applied seed would leave definitions from 2 revisions in force at
once, and the caller reports the refusal while the last seed serves. A failure inside the
transaction, such as a projection's fold, rolls the whole seed back and throws.

The caller runs one seed at a time. **Why:** 2 overlapping seeds could commit an older revision
after a newer one.

`findDefinitionsInForce` returns the newest seed with its persona text, or null before the first
seed. Every record takes its snapshot hash from it.
