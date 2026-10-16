# Host commands

A host command is one of nixie's commands that an operator or a deployment's scripts run inside
nixie's container, beside the running server: it issues an enrolment code, reports health, lists the
sandbox images, answers a memory proposal or resets the event log. The image puts a `nixie` command
on the PATH, so a script runs `nixie enrol-code` and never names the bundle's file or any other path
in the image. The commands are the whole interface a deployment has into the container, so nixie may
move its files, its database and its data directory between releases without breaking a deployment
that calls only the commands.

[The server](server.md) covers the process the commands talk to, [Kubernetes](kubernetes.md) covers
the pod a deployment runs them in, and [names in impd](impd-names.md) covers the names that the
sandbox images and the model secrets take.

## The commands a deployment runs

A deployment's scripts call these commands, each through `nixie <command>` inside nixie's container.
A command that changes nothing prints its answer on stdout and exits 0, and a command that fails
exits non-zero with a `command.failed` log line that holds the reason.

| Command                         | What it prints                                                        | Exits 0 when                         |
| ------------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `nixie health`                  | the readiness report of the running server, as JSON                   | every part is ready                  |
| `nixie health --live`           | the liveness report, as JSON                                          | the process and the database are up  |
| `nixie enrol-code`              | an enrolment code on its first line, then until when it works         | the server issued a code             |
| `nixie sandbox-manifest`        | each sandbox kind with its image's ref and the name nixie gives it    | the server would accept the manifest |
| `nixie reset --keep-sessions …` | the sequence the reset removed up to, and the device sessions it kept | the server finished the reset        |
| `nixie sessions`                | the live device sessions, as JSON                                     | the server answered                  |

The health report is the body of the server's own health endpoint, with each part's readiness and
its reason, so a deployment's check names the part that is not ready without its own copy of the
port or the path. The sandbox manifest comes from the same loader the server starts with, so a
manifest that the server refuses fails the command too, and the names it prints are the names the
server asks impd for. The reset needs `--yes` as well, as [the reset](#the-reset) describes.

A deployment never deletes a file in the data directory, because the reset is the one way to empty
nixie's data. The reset destroys every sandbox before it removes anything, so the conversation's
transcript on the sandbox disk goes with the log, and a deleted database file would leave it behind.

## The control socket

Only the writer may write, so a host command never opens the database. It asks the running server
over a Unix control socket in the data directory, in a folder only nixie's user may enter. Starting
the server removes a stale socket file first, because the writer lock proves that no other server
runs. The health and sandbox-manifest commands are the exceptions: the health command reads the
server's health endpoint on the address the configuration names, and the sandbox-manifest command
reads the manifest in the image.

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
