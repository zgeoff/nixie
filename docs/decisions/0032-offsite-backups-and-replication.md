# 0032: Offsite backups and replication

- Status: decided
- Date: 2026-10-10
- Amends: [0010](./0010-memory-store.md), [0020](./0020-deployment.md)

## Decision

Restic holds scheduled encrypted snapshots of the data store and the wrapped key store in separate
repositories. Litestream replicates the data database offsite to S3-compatible object storage. The
deployment selects the S3-compatible backend through configuration; the platform adopts no cloud
provider. Endpoint, bucket, region, credential references and any compatibility settings belong to
the deployment under [0020](./0020-deployment.md). Restic and rclone supply the storage backends for
this implementation, so nixie needs no provider-specific calls for ordinary object storage.

Offsite backup copies may live on provider storage as ciphertext. The owner-controlled host remains
the primary store of readable personal data. This narrows the storage test in
[the principles](../principles.md); it does not authorize readable database envelopes on provider
storage. The owner chose host-side encryption for the Litestream replica before upload. Litestream
0.5.x has no client-side age encryption, and nixie's item encryption leaves envelopes readable. The
host runs rclone as a local S3 gateway over a crypt remote: Litestream sends database replica
objects to the gateway, and rclone encrypts their payloads and filenames before upload. The provider
must not be able to read the replica payload. Server-side encryption alone does not meet that
boundary because the provider handles readable pages and, with SSE-C, the supplied key.

Litestream never replicates the key store. Its historical copies would preserve deleted keys. Every
recoverable key backup follows 0010: a forget stays pending until its deleted keys leave every
registered recoverable copy. Scheduled key backups alone do not give new encrypted content the
replica's recovery window; the matching-key recovery mechanism and its validation remain open.

## Platform and deployment boundary

nixie owns the backup lifecycle and its guarantees: client-side encryption, recoverable data with
matching keys, and complete removal of registered recoverable key copies before forget completion.
Restic, Litestream and rclone are the selected implementation of that lifecycle; another
implementation must preserve those guarantees. Existing tool backends provide the provider
abstraction, rather than a new wrapper around each cloud vendor.

The deployment repo owns infrastructure, secrets and backend settings. The definitions source owns
personas, prompts, jobs and policy seeds; it does not choose backup infrastructure. A backend's
versioning, retention and deletion behavior still needs validation: S3 API compatibility alone is
not proof that the forget contract holds.

## The first build

The first build runs hourly Restic snapshots of the data and key stores on one Compose host, as
[the first build](../design/deployment/deployment.md#first-build) sets out. A forget there reports
pending until the key repo prunes every older snapshot. The Litestream replica through the rclone
gateway follows once recovery with matching keys passes.

## Alternatives and trade-offs

- Restic alone gives encrypted historical snapshots, but its proposed hourly cadence can lose up to
  an hour of new writes after total disk loss.
- Restic plus a replica on another local disk recovers recent database changes, but loss of the
  whole host still loses that replica.
- Kopia is an alternative encrypted snapshot tool; its repositories have not been tested here.
- A local Litestream file replica with a separate encrypted uploader avoids the S3 gateway, but adds
  upload scheduling and consistency work.

The offsite replica protects recent database changes from host loss at the cost of another service,
cloud requests, an experimental encryption gateway and a separate key-recovery path. No recovery
bound is established until both data and keys restore together.

## Validation and open choices

The local deployment spike restored Restic snapshots on a clean host. The paired-store control shows
that fresh data with an older key backup cannot decrypt new text. The
[replica encryption spike](../../spikes/replica-encryption/) tests the selected host gateway with
process outages and a fresh-config restore; it tests no cloud provider or matching-key recovery. The
matching-key recovery, backend forget cleanup and end-to-end restore test remain open in
[the deployment design](../design/deployment/deployment.md#agreed-backup-design) and
[open items](../design/open-items.md).
