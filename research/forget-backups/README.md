# Spike: forget completion across key backups

This spike checks whether a forget can remove a deleted memory key from a local restic backup
repository before the forget reports completion. It tests the
[forget contract](../../docs/design/platform/memory/store.md#forget-completion-and-key-backups)
against a candidate backup tool, and the deployment choice does not adopt restic through it.

## Question

When a forget deletes a memory key from the live store, can old key snapshots in a backup still
decrypt the forgotten item, and which sequence of snapshot removal, pruning and checks closes every
route before the forget completes?

## Answer

- `forget --keep-last 1` keeps one snapshot per host/path group, so both old key snapshots survive
  and decrypt the forgotten item.
- Removing every old snapshot by ID leaves the unreferenced key blob readable through
  `restic cat blob`, so snapshot removal alone cannot complete a forget.
- A fresh key snapshot, removal of every other snapshot by ID, a prune with `--max-unused 0`, a data
  check and a restore of each surviving key snapshot pass all 21 assertions.
- The forget stays durably pending between snapshot removal and prune, and a reopened prune
  succeeds.

Complete a forget only after every backup backend has pruned the old key data and acknowledged it.

## Run it

```bash
bun install
NIXIE_RESTIC_BIN=/absolute/path/to/restic bun run check
```

The [setup](results.md#setup) gives the versions and what the run creates.

## Results

The [results](results.md) hold the fixture, the two controls, the corrected sequence and the 21
assertions.

## Untested

A process kill or power loss, competing publishers, and any backend beyond one local filesystem. The
[untested list](results.md#untested) gives the rest.
