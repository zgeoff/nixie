# Spike: forget completion across key backups

This spike checks whether a forget-triggered refresh can remove a deleted memory key from a local
backup repository before the operation reports completion. It tests a candidate backup tool; the
deployment choice does not adopt restic through this experiment.

- Bun 1.4.2, bundled SQLite, and the encryption helpers from
  [memory-shred](../memory-shred/store.ts).
- restic 0.19.1, from
  `restic/restic:0.19.1@sha256:136600b6ff6843d61d355f7f71f460a166429f35de6fd11b568fece3c9a4d510`.
- Synthetic memory, generated test keys, temporary local repositories and no model calls.

## Run it

Set `NIXIE_RESTIC_BIN` to an installed restic 0.19.1 binary. Run from this directory:

```bash
bun install
NIXIE_RESTIC_BIN=/absolute/path/to/restic bun run check
```

[run.ts](./run.ts) creates its own temporary data and key repositories. It passes generated fixture
credentials only to child processes, disables the restic cache and removes its temporary directory
after the run. It never opens a configured user repository.

## What it tests

The fixture encrypts two versions of one target item and one neighbouring item. A data snapshot
contains ciphertext only. Two old key snapshots, under different fixture host names, contain the
wrapped key that can still open that target. The live forget removes the target key in a transaction
with a key-generation change, then checkpoints the key store.

Two controls expose incomplete cleanup:

- `forget --keep-last 1` retains one snapshot per default host/path group. Both old snapshots
  survive, and the old key file decrypts the forgotten item.
- Removing every old snapshot by explicit ID leaves its unreferenced data blob accessible through
  `restic cat blob`. Reconstructing that key file still decrypts the forgotten item. Snapshot
  removal alone cannot complete the forget.

The corrected sequence acknowledges a fresh key snapshot, removes all other snapshots by ID, prunes
unused data with `--max-unused 0`, checks repository data and restores every surviving key snapshot
against the older data snapshot. The operation stays durably pending between snapshot removal and
prune. Reopening that phase and repeating prune succeeds; only then can it complete. Local staging
and recovered old-key files leave before completion.

## Results

The run passes 21 assertions:

- exactly one acknowledged fresh key snapshot survives
- the obsolete key blob becomes unavailable through the repository API
- the forgotten item remains unreadable with every surviving key snapshot and the older data
  snapshot
- the neighbouring item still decrypts
- the durable prune-pending phase survives reopening, and repeated prune succeeds

The [restic retention contract](https://restic.readthedocs.io/en/stable/060_forget.html)
distinguishes snapshot removal from data pruning and describes the default retention grouping. The
controls reproduce those distinctions with a wrapped memory key rather than a text marker alone.

A separate paired-store control creates a new item after the key snapshot, then copies the latest
data. The new item decrypts with current keys and fails to decrypt with the older key copy, while
the older neighbour still reads. Fresh data alone cannot restore new encrypted content. This is not
a Litestream execution; a replica's useful recovery boundary depends on key availability too.

## Limits

The restart is a database close and reopen, not a process kill or power loss. The generation test
checks a held staging copy against a newer live generation; it does not stress competing publishers
or implement a distributed lock. It tests one local filesystem backend, not cloud versioning,
immutable retention, hidden provider copies or physical media erasure. It performs no live SDK
cleanup. The fixture never restores a deleted key into the live store.

The [forget contract](../../docs/design/memory/store.md#forget-completion-and-key-backups) requires
every registered backend to acknowledge cleanup and rejects stale publication. Each selected
deployment backend needs its own validation. A failed or unreachable cleanup remains pending; the
ordinary backup schedule cannot make a completed forget recoverable again.
