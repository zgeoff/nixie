# The definitions

`modules/definitions` reads your definitions from a definitions source, seeds the persona into the
database, and builds the snapshot hash that every record carries. A source returns a snapshot of
files with a content hash. The seed parses the snapshot and puts its persona in force under a
snapshot hash. The content hash covers the source files, and the snapshot hash covers the
definitions in force, so the 2 hashes differ for the same files. A local path is the one source
built.

## Sources and snapshots

A source has a probe and a snapshot. The probe returns a token that changes when the definitions
change, so a poll takes a snapshot only on a new token. A snapshot holds the files by path relative
to the definitions root, a revision, the content hash and the paths the source skipped. The path
source uses the content hash as its revision and its probe token, because a directory has no commit.

### What a source reads

A source reads only the known definitions paths: the manifest and the persona at the root, and the
jobs, rules and skills folders. It skips every other root entry by name, without reading or entering
it, so the entry never enters the content hash, never has to parse, and never counts towards the
size limits. **Why:** a definitions repo can then hold its own docs and scripts, and editing a
readme never makes a new definitions version. The snapshot still lists each skipped root entry, so a
misnamed folder such as `rule/` shows in the seed result instead of its rules going unread without a
trace.

Within the known paths, every source applies one filter:

- It skips every path with a part that starts with a dot, such as `.git`.
- It keeps every file under `skills/`, whatever its extension. **Why:** a skill brings its scripts,
  as the [skills design](../design/platform/skills.md#the-definitions-filter-under-skills) sets out.
- It keeps only markdown, YAML and JSON files under `jobs/` and `rules/`.

Every kept file must decode as UTF-8, so a binary file under `skills/` fails the snapshot.

The path source never follows a link out of the root. A symlink that stays inside the root is
skipped, and a symlink that leads outside the root, or resolves nowhere, fails the snapshot. The
source checks each kept file again when it opens it, because a file can change after the walk.
**Why:** no file from outside the definitions reaches the seed.

A snapshot past the per-file or the total size limit fails, and its error lists the files at fault
in path order. Skipped files never count towards the total.

### The content hash

The content hash covers a format version line, then each file in path order with its path, its byte
length and its own hash. Every source turns CRLF line endings into LF before it hashes. Git
metadata, mode bits and file times never enter the hash. **Why:** a git commit and a checkout of it,
on any platform, give the same hash, as the
[definitions source spike](../design/platform/spikes/definitions-source/README.md) showed.

## The definitions format

The seed reads 2 files from a snapshot: the manifest, which holds the definitions format version,
and the persona, which must be UTF-8 text and not blank. A release reads its own format and the one
before, and refuses any other. **Why:** an image upgrade and a definitions change land in separate
repos, in either order.

The seed applies no other file, and lists each one as unapplied, such as a rule file or a skill.
Each unapplied YAML or JSON file must still parse. A file that fails to decode or parse fails the
whole snapshot, and the error lists each file with its fault.

## The snapshot hash

The snapshot hash is the hash of one canonical form of the definitions in force:

- **The persona** normalises to Unicode NFC with LF line endings, no byte order mark and exactly one
  final newline. Trailing spaces stay, because 2 of them end a markdown line with a break. The
  persona enters the form by its own hash, its persona version.
- **Policy** holds the rules sorted by ID and the tool declarations sorted by name, each tool's
  effects sorted and without duplicates.
- **Objects** serialise as canonical JSON, with sorted keys and no whitespace.

The policy holds the fixed rule and every tool declaration in the registry. **Why:** the fixed rule
decides by a tool's declared effects, so a replay needs the declarations in force. A release that
changes a tool declaration therefore changes the snapshot hash over the same files.

## Seeding

A seed parses a snapshot, builds its snapshot hash, and writes 4 things in one write transaction,
which commit together or not at all: the persona under its persona version, the snapshot under its
snapshot hash, a seeded record, and a seed row that ties the source and its revision to both hashes.
A persona or a snapshot seen before keeps its first row.

A seed returns one of 3 results:

| Result    | When                                                                      | Writes  |
| --------- | ------------------------------------------------------------------------- | ------- |
| Seeded    | The source, revision, content hash or snapshot hash differs from the last | 4 rows  |
| Unchanged | The newest seed holds the same source, revision and both hashes           | Nothing |
| Refused   | The snapshot failed to read, parse or validate                            | Nothing |

A refused seed comes back as a value with its error and the definitions still in force, and never as
a throw. **Why:** a half-applied seed would leave definitions from 2 revisions in force at once, and
the caller reports the refusal while the last seed serves. A failure inside the transaction, such as
a projection's fold, rolls the whole seed back and throws.

The caller runs one seed at a time. **Why:** 2 overlapping seeds could commit an older revision
after a newer one.

The definitions in force are the newest seed, and every record takes its snapshot hash from it.
