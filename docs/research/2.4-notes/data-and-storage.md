# Where personal data lives

Report: 2.4

Sources were fetched on 2026-10-08 unless a different date is given with the source. Versions come
from the npm registry's `time` field or the GitHub releases API unless another source is named.

nixie holds 3 kinds of personal data: the event log, long-term memory, and the deployment's
definitions. Every primary copy can sit on the owner's host. A git host or a backup service is a
third party, so any copy that leaves the host goes as ciphertext encrypted on the client, with
restic or Kopia, or not at all. For the event log, the evidence leans to Postgres through
`kysely-postgres-js` on Bun's native SQL client: its driver is maintained by the Kysely project, and
it covers a second host without a new layer. SQLite is simpler to run on one host, and OpenWorkflow
runs the same lease pattern on `bun:sqlite`, but its Kysely dialects on Bun are stale or kept by one
person. Export works per kind of data, in formats that need no nixie to read.

## The stores

The [principle](../../brainstorm/1.3-principles.md) "Owner data stays home" asks that every store of
personal data sit on a host the owner controls, in a form the owner can read and export.

| Store             | Holds                                               | Primary copy        | Off-host copy                    |
| ----------------- | --------------------------------------------------- | ------------------- | -------------------------------- |
| Event log         | Tasks, decisions, approvals, transcripts, snapshots | Database on host    | Encrypted backup                 |
| Long-term memory  | Facts, preferences, notes                           | Git repo on host    | Encrypted backup, or gcrypt push |
| Deployment repo   | Persona, jobs, starter rules                        | Git repo            | Any git host the owner picks     |
| SDK session files | The SDK's transcript for each turn                  | `CLAUDE_CONFIG_DIR` | Encrypted backup                 |
| Search index      | Embeddings and full-text index of memory            | Host                | None: nixie rebuilds it          |

The deployment repo holds definitions, not personal data, so a public or third-party host suits it
when the owner keeps persona text impersonal. A persona that mentions family or habits is personal
data, and moves to the memory repo's rules. The SDK session files carry the
[turn checkpoint](../2.2-notes/engines.md#sessionstore-as-the-turns-checkpoint), and the model
provider sees each turn's content whatever nixie stores.

## Git hosts

A git server on the owner's host keeps memory history at home. 4 options run for one owner:

| Server             | Version              | Licence | Footprint                              |
| ------------------ | -------------------- | ------- | -------------------------------------- |
| Bare repo over SSH | git                  | GPL-2.0 | sshd only                              |
| Soft Serve         | v0.12.3, 2026-10-05  | MIT     | 1 Go binary, SQLite by default, SSH UI |
| Forgejo            | v16.0.5; v15.0.9 LTS | GPL-3.0 | Web app and database, CI and issues    |
| Gitea              | v28.1.0, 2026-10-06  | MIT     | Web app and database, CI and issues    |

Sources: [Soft Serve](https://github.com/charmbracelet/soft-serve),
[Forgejo release schedule](https://forgejo.org/docs/latest/admin/release-schedule/),
[Forgejo FAQ](https://forgejo.org/faq/),
[Gitea v28.0.0](https://github.com/go-gitea/gitea/releases/tag/v28.0.0),
[git on the server](https://git-scm.com/book/en/v2/Git-on-the-Server-Setting-Up-the-Server).

Forgejo 15.0, the long-term support (LTS) series, is supported until 2027-07-15, and the 16.0 series
reaches end of life on 2026-10-29. Forgejo moved from MIT to GPL-3.0 at v9.0. Gitea 28.0 dropped the
`1.` prefix and turned self-registration off by default. nixie needs no web UI for memory, since the
owner reads memory through nixie and an editor, so a bare repo or Soft Serve covers it.

## Encrypted remotes

A git filter leaks history to the host; only whole-repo encryption hides it:

- **git-crypt** v0.8.0, of 2025-09-23, is the first release since 2022. Its README states that it
  "does not encrypt file names, commit messages, symlink targets, gitlinks, or other metadata", and
  that it does not support revoking access. Its encryption is deterministic, so the host sees when a
  file changes, its size, and which files are equal
  ([README](https://github.com/AGWA/git-crypt/blob/master/README.md)).
- **git-remote-gcrypt** encrypts the whole repo with GnuPG, branch names and pack metadata included.
  Every push "effectively has a --force", and SFTP or plain git backends re-upload the whole history
  on each push. It supports GPG only, not age. Its last push was 2026-08-15, and its upstream
  version is unverified ([repo](https://github.com/spwhitton/git-remote-gcrypt)).
- **git-agecrypt** has had no push since 2024-05-18, and its author advises sops instead
  ([repo](https://github.com/vlaci/git-agecrypt)).
- **sops** v3.13.3, of 2026-07-23, encrypts values and leaves keys and structure in plain text. It
  takes age recipients ([sops age docs](https://getsops.io/docs/usage/identities/age/)). It suits
  secrets in the deployment repo, not memory.

age v1.3.2, of 2026-08-29, is the key format worth standardising on. v1.3.0 added hybrid
post-quantum recipients and built-in recipient types for hardware plugins, and typage, the
TypeScript age library, decrypts with a passkey through WebAuthn PRF
([age releases](https://github.com/FiloSottile/age/releases);
[passkey encryption](https://words.filippo.io/passkey-encryption/)). nixie can then read age files
in Bun.

## Backups

A backup tool that encrypts on the client gives any remote only ciphertext, with names and structure
hidden:

| Tool         | Version                  | Licence    | Encryption on the client                   | Remotes                                |
| ------------ | ------------------------ | ---------- | ------------------------------------------ | -------------------------------------- |
| restic       | v0.19.1, 2026-07-05      | BSD-2      | Everything; a lost password loses the data | SFTP, REST, S3, B2, GCS, Azure, rclone |
| Kopia        | v0.23.1, 2026-06-16      | Apache-2.0 | Everything but tool version and repo ID    | S3, B2, SFTP, WebDAV, rclone           |
| BorgBackup   | 1.4.5; 2.0 still in beta | BSD-3      | Everything                                 | SSH with borg on the server            |
| rclone crypt | v1.75.1, 2026-09-04      | MIT        | Contents and names; sizes and times leak   | 70+ services                           |

Sources:
[restic repository docs](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html),
[Kopia encryption](https://kopia.io/docs/advanced/encryption/),
[Kopia repositories](https://kopia.io/docs/repositories/),
[rclone repo](https://github.com/rclone/rclone),
[Borg licence](https://github.com/borgbackup/borg/blob/master/LICENSE),
[Borg releases](https://www.borgbackup.org/releases/), [rclone crypt](https://rclone.org/crypt/).

Borg's project states "Borg 2.0 is currently in testing — do not use it in production". restic or
Kopia over the event log's dump, the memory repo and the SDK session files gives one encrypted copy
off the host. A backup of the memory repo with restic hides its history from the remote, which a git
filter cannot do.

## Postgres or SQLite for the event log

[Decision 0001](../../decisions/0001-durable-layer.md) leaves this open. The event log holds task
state machines, leased steps, and approvals consumed in the transaction that runs the action. nixie
starts on one host and may add a second.

### The drivers on Bun

Bun 1.4.2, which nixie pins, went to npm on 2026-09-05. `Bun.SQL` supports PostgreSQL, MySQL and
SQLite behind one API, and offers LISTEN and NOTIFY on Postgres only
([Bun SQL docs](https://bun.com/docs/runtime/sql)). Kysely is at 0.29.6, of 2026-09-16
([releases](https://github.com/kysely-org/kysely/releases)).

| Driver                  | Version, date     | Kysely peer | Maintainer     | Status                              |
| ----------------------- | ----------------- | ----------- | -------------- | ----------------------------------- |
| `kysely-postgres-js`    | 5.0.1, 2026-09-25 | `>=0.29 <1` | Kysely project | 4 releases since 2026-08-22         |
| `kysely-bun-sqlite`     | 0.4.0, 2025-05-12 | `^0.28.2`   | 1 person       | No release or commit since          |
| `kysely-bun-worker`     | 2.0.1, 2026-07-21 | `>=0.29`    | 1 person       | Maintained; runs SQLite in a Worker |
| `kysely-bun-sql`        | 0.2.0, 2025-12-01 | `^0.28.8`   | 1 person       | Postgres only                       |
| `@libsql/kysely-libsql` | 0.4.1, 2024-07-30 | `*`         | Turso          | Stale                               |

Sources: npm registry for [kysely-postgres-js](https://registry.npmjs.org/kysely-postgres-js),
[kysely-bun-sqlite](https://registry.npmjs.org/kysely-bun-sqlite),
[kysely-bun-worker](https://registry.npmjs.org/kysely-bun-worker),
[kysely-bun-sql](https://registry.npmjs.org/kysely-bun-sql) and
[@libsql/kysely-libsql](https://registry.npmjs.org/@libsql/kysely-libsql).

`kysely-postgres-js` runs on postgres.js or on Bun's native SQL binding, and v4.0.0 added query
cancellation on Bun ([README](https://github.com/kysely-org/kysely-postgres-js)). Kysely's own
getting-started page marks `sqlite` as unsupported under Bun. Its built-in `SqliteDialect` expects a
better-sqlite3 statement with a `reader` flag and array arguments, and Bun's `Statement` has
neither, so `bun:sqlite` needs a thin adapter ([Kysely dialects](https://kysely.dev/docs/dialects)).
No Kysely dialect targets the SQLite mode of `Bun.SQL`.

`bun:sqlite` is synchronous, so a long query blocks the event loop. It supports the write-ahead log
(WAL), `transaction.immediate`, `loadExtension()` and `strict: true`. On macOS, Apple's system
SQLite cannot load extensions without `Database.setCustomSQLite()`
([bun:sqlite docs](https://bun.com/docs/runtime/sqlite)).

### The queue pattern on each

Postgres 18.6, of 2026-08-13, has `FOR UPDATE SKIP LOCKED`, LISTEN and NOTIFY for wake-ups, and
advisory locks ([versions](https://www.postgresql.org/support/versioning/)). SQLite 3.53.4, of
2026-07-24, allows one writer at a time, so a `BEGIN IMMEDIATE` transaction with a conditional
`UPDATE … RETURNING` serialises claims without `SKIP LOCKED` ([WAL](https://sqlite.org/wal.html);
[transactions](https://sqlite.org/lang_transaction.html)).

Shipping queues use both:

- OpenWorkflow 0.10.1 has a Postgres backend with `SKIP LOCKED` and a SQLite backend on `bun:sqlite`
  with `BEGIN IMMEDIATE`, whose source notes "SQLite doesn't have SKIP LOCKED, so we need to handle
  claims differently"
  ([backend.ts](https://github.com/openworkflowdev/openworkflow/blob/main/packages/openworkflow/sqlite/backend.ts)).
- Oban v2.24.0 ships engines for PostgreSQL, MySQL and SQLite 3.37+
  ([Oban](https://github.com/oban-bg/oban)).
- River has a `riversqlite` driver under active work
  ([River drivers](https://github.com/riverqueue/river/tree/master/riverdriver)).
- OpenClaw runs its delivery queue on SQLite with a claim step
  ([OpenClaw](https://github.com/openclaw/openclaw)).
- Absurd 0.5.0 is "entirely based on Postgres and nothing else"
  ([Absurd](https://github.com/earendil-works/absurd)).

### Embedded and distributed variants

None of the variants removes the trade-off:

- **PGlite** 0.5.8 runs Postgres in WASM under Bun, and Kysely ships a core dialect for it. Its
  README states "PGlite is single user/connection", so it suits tests, not a queue with several
  workers ([PGlite](https://github.com/electric-sql/pglite)).
- **Turso Database** v0.8.2, of 2026-10-06, is pre-1.0 and "replaces libSQL as our intended
  direction". Its `BEGIN CONCURRENT` mode returns `SQLITE_BUSY` on a row conflict for the caller to
  retry, and its encryption is experimental ([Turso](https://github.com/tursodatabase/turso);
  [manual](https://github.com/tursodatabase/turso/blob/main/docs/manual.md)). Its Bun support is
  unverified.
- **libSQL server** last released v0.24.32 on 2025-02-14
  ([releases](https://github.com/tursodatabase/libsql/releases)).

### Backups and encryption at rest

SQLite backs up as a file: the backup API or `VACUUM INTO` copies a live database, and Litestream
v0.5.17 streams changes off the host, under a "beta" badge
([VACUUM](https://sqlite.org/lang_vacuum.html);
[Litestream](https://github.com/benbjohnson/litestream)). Litestream v0.5.0 dropped more than one
replica per database ([Fly blog](https://fly.io/blog/litestream-v050-is-here/)). Postgres has
`pg_dump` piped into restic with `--stdin`, and pgBackRest 2.59.3 for point-in-time recovery.

Neither engine encrypts at rest under Bun. Postgres has no transparent data encryption (TDE)
upstream. `bun:sqlite` has no SQLCipher support, and Bun issue #11397 has asked for it since
2024-05-27 ([issue](https://github.com/oven-sh/bun/issues/11397)). Disk encryption, such as Linux
Unified Key Setup (LUKS), covers both.

### Weighing the evidence

| Factor               | Postgres                                   | SQLite                                             |
| -------------------- | ------------------------------------------ | -------------------------------------------------- |
| Kysely driver on Bun | Kysely project, async, maintained          | 1 maintained dialect from 1 person, or own adapter |
| Second host          | Native over the network                    | Needs Turso or libSQL, neither ready               |
| Wake-ups             | LISTEN and NOTIFY                          | Polling, or an in-process signal on one host       |
| Running it           | A service, auth, a major upgrade each year | A file in the process                              |
| Backups              | `pg_dump` or pgBackRest                    | Copy the file; Litestream in beta                  |
| Owner export         | A dump needs Postgres to read              | The file is the export                             |
| Reference designs    | Absurd, DBOS, OpenWorkflow                 | OpenWorkflow, Oban, River                          |

The Library of Congress lists SQLite as a preferred format for datasets
([LoC formats](https://www.loc.gov/preservation/resources/rfs/data.html)), which makes a SQLite file
a good export even when Postgres holds the live log.

## Export

Comparable products export less than nixie's principle asks:

- ChatGPT emails a ZIP with `conversations.json` and `chat.html`; the official page refused the
  fetch, so this rests on a secondary source
  ([guide](https://ai-toolbox.co/ai-toolbox-chatgpt-features/export-chatgpt-to-json-complete-guide)).
- Claude's data export link expires within 24 hours, and memory has no file export
  ([export](https://support.claude.com/en/articles/9450526-how-can-i-export-my-claude-data);
  [memory](https://support.claude.com/en/articles/12123587-importing-and-exporting-your-memory)).
- OpenClaw's `openclaw backup create` writes a `.tar.gz` with a versioned `manifest.json` and SQLite
  snapshots compacted with `VACUUM` ([backup](https://docs.openclaw.ai/cli/backup)).
- Letta Code v0.32.2 removed the Agent File import and export commands
  ([release](https://github.com/letta-ai/letta-code/releases/tag/v0.32.2)).

No memory interchange format has vendor adoption. The W3C AI Agent Memory Interoperability Community
Group adopted its charter on 2026-06-19, and `draft-vu-aimem-bundle-00` is an individual IETF draft
([W3C group](https://www.w3.org/community/ai-agent-memory-interop/2026/07/16/version-1-0-charter-adopted-ai-agent-memory-interoperability-community-group/);
[IETF draft](https://datatracker.ietf.org/doc/draft-vu-aimem-bundle/)).

## Deletion and the append-only log

An append-only log and git history both keep what the owner deletes. 2 mechanisms remove it:

- **Crypto-shredding.** nixie encrypts personal fields with a key per record or per subject, keeps
  the keys outside the log, and deletes a key to erase its fields
  ([Verraes](https://verraes.net/2019/05/eventsourcing-patterns-throw-away-the-key/)). Whether that
  counts as erasure under the EU General Data Protection Regulation (GDPR) is argued, not settled
  ([Conduktor](https://www.conduktor.io/blog/gdpr-kafka-right-to-erasure.md)).
- **Rewriting history.** git-filter-repo 2.47+ with `--sensitive-data-removal` rewrites every later
  commit hash and drops signatures. Old clones keep the data, and a third-party host needs its own
  purge
  ([GitHub guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)).

Backups keep deleted data until their snapshots are pruned. A deletion therefore reaches the event
log, the memory repo, every remote, and the backup retention window, and a forgotten memory leaves a
gap in replay for the records that cited it.

## Worth borrowing

- Soft Serve or a bare repo over SSH as the memory remote on the owner's host.
- restic or Kopia as the only route for personal data off the host.
- age keys, with typage for reading them in Bun and a passkey or YubiKey for the owner's key.
- OpenWorkflow's `BEGIN IMMEDIATE` claim on SQLite and `SKIP LOCKED` claim on Postgres, as
  references for nixie's lease.
- OpenClaw's backup archive with a versioned manifest and `--verify`.
- A SQLite file as the export format for structured data.

## Worth avoiding

- git-crypt or any other git filter for personal data on a third-party host.
- Borg 2.0 while it is in beta.
- A Kysely dialect pinned to Kysely 0.28.
- PGlite or Turso Database as the production event log while each carries its stated limits.
- An export link that expires, or a memory with no file export.

## Recommendations

The research recommends the following, for the owner to decide:

1. **Postgres for the event log, through `kysely-postgres-js` on Bun's native SQL client.** The
   driver comes from the Kysely project and tracks Kysely 0.29, a second host needs no new layer,
   and LISTEN and NOTIFY wake a worker without polling. The trade-off is a service to run, a major
   upgrade each year, and a dump that needs Postgres to read. SQLite through `kysely-bun-worker` or
   nixie's own adapter is the strong alternative if the owner rules out a second host: it removes
   the service, and the file is its own export.
2. **Keep every primary copy on the owner's host.** Memory lives in a repo served by Soft Serve or
   over SSH, and the event log in the database next to it. The cost is that the owner's host is the
   single place everything lives until a backup runs.
3. **Send personal data off the host only through restic or Kopia.** A third-party remote then holds
   ciphertext with names and history hidden. The cost is that the owner cannot browse memory on that
   remote; git-remote-gcrypt is the option for an encrypted git remote, at the price of forced
   pushes and GPG.
4. **Export per kind of data.** Memory exports as its markdown repo, the event log as a SQLite file
   with a JSONL copy, and definitions as the deployment repo plus the snapshot table from
   [the versioning notes](definition-versioning.md). A manifest with a schema version ties the parts
   together. The cost is an export job nixie owns and tests.
5. **Use crypto-shredding for erasable fields in the event log.** A key per memory item or per
   contact lets the owner forget without rewriting the log. The cost is key management, and replay
   shows a gap where a shredded field was.
6. **Encrypt the disk.** Neither database encrypts at rest under Bun, so LUKS or the host's volume
   encryption covers the database, the repo and the SDK session files.

## Open questions

- Will nixie ever run on a second host? The answer decides most of the Postgres and SQLite
  trade-off.
- Which fields in the event log are personal enough for their own key? Message bodies and memory
  content are candidates; tool names and rule IDs are not.
- Where does the owner's age key live, so that a restore works when the host is lost? A passkey or
  YubiKey is one option, and a paper key another.
- Does the SDK's transcript under `CLAUDE_CONFIG_DIR` count as a store the owner must be able to
  read and export, or only as a cache that nixie's own log supersedes?

### Spikes that would settle these

- **The event log on both engines** (about 1 day): a leased step, an approval consumed in the same
  transaction, and a crash at each point, on `kysely-postgres-js` over `Bun.SQL` and on `bun:sqlite`
  through `kysely-bun-worker`. It measures claim latency, the event-loop block under `bun:sqlite`,
  and whether recovery is exact.
- **Backup and restore** (about half a day): restic over a Postgres dump or a SQLite `VACUUM INTO`
  copy and the memory repo, restored to a clean host from an age key on a passkey.
