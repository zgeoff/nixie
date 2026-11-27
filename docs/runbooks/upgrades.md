# Upgrade and roll back

An upgrade or a rollback by one release is one merged pull request in your deployment repo that
moves the 3 pinned images: nixie, web and backup. These steps cover the pull request and the deploy,
on Compose, on Kubernetes with the reference manifests, and on Kubernetes with the Pulumi component.
[Upgrades](../design/platform/deployment/upgrades.md) gives the design.

## Before an upgrade

1. Read the release notes for each migration, and for whether the release before can read the schema
   this release leaves, as the [release pipeline](../architecture/deployment/release-pipeline.md)
   describes.
2. When the deployment skips releases, also follow
   [deploy in milestones](releasing.md#deploy-in-milestones).
3. When your copy of the starter rules has `ask-coding-sessions` on `task.start/atc` and
   `allow-coding-spawns` on `coding.start`, edit them to match
   [`starter.yaml`](../../deploy/compose/definitions/rules/starter.yaml): ask on `coding.start`, and
   allow on `coding.spawn`. Without the edit, your allow rule covers the model's `coding.start`
   call, so a join of a coding session needs no approval.
4. Open the rules files in your deployment repo's `definitions/rules/` folder. When a rule has a
   `cel` key and no `note`, add a `note` in plain words that says what the condition checks. The
   next seed refuses a rules file that holds such a rule. This applies only to a rule you write by
   hand in that folder. See [rule conditions](../architecture/policy/rule-conditions.md) for what a
   condition reads.

## Upgrade

Make the change in a pull request in the deployment repo. Take each tag and digest from the release
notes, and move all 3 pins together.

1. Change the pins:
   - Compose: every `ghcr.io/zgeoff/nixie` image, in the `setup`, `nixie` and `enrol` services, the
     `nixie-web` image, and the backup container's image when the deployment runs one. The reference
     recipe runs no backup job, as [backups](../architecture/deployment/backups.md) says.
   - Kubernetes manifests: the image in `nixie.yaml` and the image in `web.yaml`.
   - Pulumi component: the nixie image and the web image arguments, and the `@heynixie/pulumi-k8s`
     version. The version carries the release's backup image, unless `backup.image` names one. In
     that case move `backup.image` too.
2. Merge the pull request.
3. Deploy in this order: the backup job, then nixie, then web. **Why:** the backup job reads the
   snapshot set format of its own release and of the one before. The web client then only calls an
   API of its own release or a newer one, and a failed nixie step stops the rollout before the web
   client changes. The Pulumi component sets its own order, so on Pulumi follow
   [Deploy with Pulumi](#deploy-with-pulumi) in place of this one.

### Deploy on Compose

Run these on the host, in the deployment repo's checkout.

1. Fast-forward the checkout:

   ```bash
   git pull --ff-only
   ```

2. Pull the new images while the old version keeps running:

   ```bash
   NIXIE_SECRETS_FILE=<sops_file> NIXIE_AGE_KEY_FILE=<age_key_file> docker compose pull
   ```

3. When the deployment runs a backup service, replace it first:

   ```bash
   docker compose up -d --wait --no-deps <backup_service>
   ```

4. Replace nixie:

   ```bash
   docker compose up -d --wait --no-deps nixie
   ```

5. Replace the web client:

   ```bash
   docker compose up -d --wait --no-deps web
   ```

Set `NIXIE_SECRETS_FILE` and `NIXIE_AGE_KEY_FILE` on each `docker compose` command, as the
[Compose guide](../guides/compose.md) does. Steps 3 to 5 show only the command, so add the two
assignments before it.

### Deploy on Kubernetes with the manifests

1. Apply nixie, then wait for the StatefulSet:

   ```bash
   kubectl -n <namespace> apply -f nixie.yaml
   kubectl -n <namespace> rollout status statefulset/nixie
   ```

2. Apply web, then wait for its Deployment:

   ```bash
   kubectl -n <namespace> apply -f web.yaml
   kubectl -n <namespace> rollout status deployment/nixie-web
   ```

### Deploy with Pulumi

The component rolls nixie's StatefulSet first, then the web Deployment and the backup CronJob. The
backup job moves after nixie here, which is safe: it reads the snapshot set format of its own
release and of the one before. Run the update:

```bash
pulumi up
```

## Roll back

A rollback reverts the upgrade and deploys in the reverse order. When the release before reads the
schema, the revert loses no write.

1. Revert the upgrade commit in a pull request:

   ```bash
   git revert <upgrade_commit>
   ```

2. Merge the pull request.
3. Deploy in this order: web, then nixie, then the backup job. **Why:** the web client then only
   calls an API of its own release or a newer one, and the newer backup job, which reads the
   snapshot set format of the release before, keeps running until nixie has moved back.

On Compose, follow [Deploy on Compose](#deploy-on-compose) with `web` first, then `nixie`, then the
backup service. On the Kubernetes manifests, apply `web.yaml` and wait for its rollout, then apply
`nixie.yaml` and wait for the StatefulSet. With Pulumi, the update must replace web first:

1. Find the URN of the web Deployment:

   ```bash
   pulumi stack --show-urns
   ```

   Pick the line whose type is `kubernetes:apps/v1:Deployment` and whose name is `nixie-web`.

2. Update web alone:

   ```bash
   pulumi up --target <web_urn>
   ```

3. Update the rest:

   ```bash
   pulumi up
   ```

## Past a declared break

When the release notes say the release before cannot read the schema, do not revert. The older build
refuses to start, and its error names the pre-migration copy. That copy stays for `nixie rollback`,
a later stage. When a revert is already deployed, return to the newer pin through the upgrade steps.
This runbook gives no manual steps that restore a copy.

## What a start keeps

Each start that takes a pre-migration copy keeps the newest 3 copies in the data directory, named
`nixie-schema-<version>.db`, and removes the older ones. See
[the database](../architecture/core/database.md#migrations) for the rule.
