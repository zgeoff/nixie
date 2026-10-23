# Host commands

A host command is one of nixie's commands that an operator or a deployment's scripts run inside
nixie's container, beside the running server: it issues an enrolment code, reports health, lists the
sandbox images, answers a memory or skill proposal, resets the event log, or backs up and restores
nixie's data. The image puts a `nixie` command on the PATH, so a script runs `nixie enrol-code` and
never names the bundle's file or any other path in the image. The commands are the whole interface a
deployment has into the container, so nixie may move its files, its database and its data directory
between releases without breaking a deployment that calls only the commands.

[The server](server.md) covers the process the commands talk to, [Kubernetes](kubernetes.md) covers
the pod a deployment runs them in, and [names in impd](impd-names.md) covers the names that the
sandbox images and the model secrets take.

## The commands a deployment runs

A deployment's scripts call these commands, each through `nixie <command>` inside nixie's container.
Each command prints its answer on stdout. A command that cannot reach the server, or that the server
refuses, exits non-zero with a `command.failed` log line that holds the reason. The health command
is the one exception: a server that answers not ready makes it print the report and exit 1 with no
log line, so a deployment's check reads the report and not the log.

| Command                         | What it prints                                                        | Exits 0 when                         |
| ------------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `nixie health`                  | the readiness report of the running server, as JSON                   | every part is ready                  |
| `nixie health --live`           | the liveness report, as JSON                                          | the process and the database are up  |
| `nixie enrol-code`              | an enrolment code on its first line, then until when it works         | the server issued a code             |
| `nixie sandbox-manifest`        | each sandbox kind with its image's ref and the name nixie gives it    | the server would accept the manifest |
| `nixie reset --keep-sessions …` | the sequence the reset removed up to, and the device sessions it kept | the server finished the reset        |
| `nixie sessions`                | the live device sessions, as JSON                                     | the server answered                  |
| `nixie backup --to <directory>` | each database it copied, then the directory and the number of copies  | both copies match                    |
| `nixie restore --from … --yes`  | the databases it restored and the directory they came from            | both databases were replaced         |

The health report is the body of the server's own health endpoint, with each part's readiness and
its reason, so a deployment's check names the part that is not ready without its own copy of the
port or the path. The sandbox manifest comes from the same loader the server starts with, so a
manifest that the server refuses fails the command too, and the names it prints are the names the
server asks impd for. The reset needs `--yes` as well, as [the reset](#the-reset) describes, and so
does the restore, as [backup and restore](#backup-and-restore) describes.

A deployment never reads, writes or deletes a file in the data directory. The backup and restore
commands are the one way to copy nixie's data out and back, and the reset is the one way to empty
it. The reset destroys every sandbox before it removes anything, so the conversation's transcript on
the sandbox disk goes with the log, and a deleted database file would leave it behind.

## The control socket

Only the writer may write, so a host command never opens the database. It asks the running server
over a Unix control socket in the data directory, in a folder only nixie's user may enter. Starting
the server removes a stale socket file first, because the writer lock proves that no other server
runs. Four commands are the exceptions:

- The health command reads the server's health endpoint on the address the configuration names.
- The sandbox-manifest command reads the manifest in the image.
- The backup command reads both databases through read-only connections, which never write.
- The restore command takes the writer lock itself, so it runs only while no server does.

The socket serves the host contract, a typed oRPC contract of its own beside the one
[the API](../channels/api.md) serves. Each host command calls one of its procedures through an RPC
client, and the contract checks every input before a procedure runs. The host contract stays out of
the API's OpenAPI document, because no device reaches the socket. A refusal keeps the code the part
behind the procedure threw, such as a memory store's stale version, so the command prints the status
and the reason. Any other failure answers 500 with its reason, because only nixie's user reaches the
socket.

## Sessions

The session host commands list the live device sessions and set the label of one, which writes the
label record [the API](../channels/api.md#device-sessions) describes. A label is one line of text,
because each message renders it beside the send time.

## The reset

The reset command, `reset --keep-sessions --yes`, asks the server to
[reset the event log](../core/event-log.md#the-reset) and keep the live device sessions. It refuses
to run without both flags, because only a restore from a backup undoes a reset, and it prints that
backups from before the reset still hold the old data. The server answers once the reset finishes,
then stops and exits 0, so the container runtime starts it again through the normal start. A reset
that fails exits the server 1 instead, and the command exits non-zero.

## Backup and restore

The backup command, `backup --to <directory>`, copies `nixie.db` and `keys.db` into an empty
directory, which a deployment then uploads as one snapshot. It runs in any container of nixie's
image that mounts the data directory and the configuration, beside a live server or with none, and
never waits on the writer. Each copy is SQLite's VACUUM INTO, so it holds the rows still in the
writer's write-ahead log, and the other files in the data directory, such as the pre-migration
copies and the control socket, stay out of the backup.

The two copies have to match: the `keys.db` copy holds the key of every record the `nixie.db` copy
keeps readable. The writer creates a record's key before it commits the record, and commits a forget
before it removes the key, so the command copies `nixie.db` first and `keys.db` after it. When
another connection commits to `keys.db` between the start of the first copy and the end of the
second, the pair could hold a record whose key the second copy lost, so the command copies both
again. After a fixed number of attempts that each meet a commit, it gives up and exits non-zero.

The restore command, `restore --from <directory> --yes`, replaces both databases with the copies in
a directory the backup command wrote. It takes the writer lock first, so it refuses while a server
runs and no server starts until it ends. It runs SQLite's integrity check on each copy and stages
both in the data directory before it replaces either, so a failed check, a full volume or an I/O
error stops it before it changes a database. It then removes each database's write-ahead log files,
which belong to the database it replaced. It refuses to run without `--yes`, because the data
written since the backup is lost.

The two databases move one at a time, so a restore that stops between them leaves a pair from two
backups. The restore writes a marker into the data directory before the first database moves and
removes it after the last, and a server refuses to start while the marker is there, until a restore
runs to the end. The backup command refuses the marker too. A lock file in the data directory keeps
a backup and a restore apart, because the writer lock cannot: backups share the lock, and a restore
holds it alone, so neither copies a pair that the other is replacing.

## Memory

The memory host commands list the pending memory proposals and approve or reject one. The server
answers each through the memory gate's own answer path, so an approval applies the bound operation
with its approval record and keeps the proposal's provenance ([memory writes](../memory/writes.md)).
An answer names the proposal and the action hash the listing showed. The gate refuses an answer
under another hash, to a proposal that closed or lapsed since the listing, or to one whose item
moved on, and applies nothing. Its approval record names the host as the identity that answered,
because a shell in the container reaches the socket and no device session does. The memory commands
answer once the memory store starts, and refuse before then. An approval that the gate holds for a
close match prints the matching item, and the user answers it again as a revision of that item or as
a new item. An approval may carry the user's own text in place of the proposal's, and the approved
version then records the user as its origin.

The memory item host commands show one item with every version, and edit, retire, restore, pin or
unpin it. Each change runs through the memory store as the user's own action, as a change in the
memory view does, so its version records the user as origin and source, and the earlier versions
stay in the item's history. An edit, a retirement and a restore name the version the user read, and
the store refuses one whose item moved past that version. A pin adds no version, because it changes
where the item shows and not what it says.

The skill host commands list the pending skill proposals and approve or reject one, as
[the skills](../core/skills.md#skills-that-nixie-writes) describes. An approval puts the skill in
force for the next task, with the user's edited files in place of the proposal's when the command
carries them, and a rejection needs a reason, which the conversation reads in its next turn. The
same commands list the skills nixie wrote that are in force, each marked as a conflict when the
user's definitions changed it after the approval and with the pull request that exports it, and
resolve one by keeping nixie's version or the definitions' version.

The subjects command counts the memory items and proposals of each subject, owner, shared or self,
from the running server. Its dry run reads no server: it copies a database file the operator names,
such as a backup, runs every migration of the build on the copy, and prints the counts before and
after, so the operator sees what the release's migrations do to memory before the release starts.
The dry run reads the file it names only through a read-only connection, which copies one snapshot
of the database and its write-ahead log, so it never changes the database and a server that writes
meanwhile never splits the copy.
