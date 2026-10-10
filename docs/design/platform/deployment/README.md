# Deployment design

Deployment covers how nixie runs on a host: the images, secrets, configuration and health, the
backups beside it, and how a release reaches it. [0020](../../../decisions/0020-deployment.md)
records the split between the nixie repo, the definitions repo and the deployment repo.

- [Deployment](deployment.md) — the first build, the host, the images, secrets, seeding the
  definitions, health, and Kubernetes
- [Deployment configuration](configuration.md) — the YAML file, what it holds, its schema, and how
  it is mounted
- [Backup and restore](backup-and-restore.md) — the backup sidecar, Restic snapshots, the key repo
  and forget, the offsite replica, and restoring on a new host
- [Upgrades](upgrades.md) — the pin and the bot, delivery to the host, a release on the host,
  migrations, and rollback
