# Restore nixie on a new host

These steps take you from a lost host to a restored nixie that you have checked and resumed, with
backups running again. They cover Compose, Kubernetes with the reference manifests, and Kubernetes
with the Pulumi component.
[Backup and restore](../design/platform/deployment/backup-and-restore.md#restoring-on-a-new-host)
gives the design, and [the backup pair](../design/queue/backup-pair.md) gives the fetch and the
restore.

## Before you start

You need:

- both restic repositories that the backup job writes, the data repository and the key repository,
  and the password of each;
- your deployment repo;
- your recovery key, the age key that opens the deployment's sops files without the lost host's key;
- a release of nixie that starts paused after a restore, pinned in your deployment repo.

**Use a release that starts paused after a restore.** Its release notes list the restore pause. A
release without the pause refuses to start on the data directory that the restore leaves. After a
release with the pause has started on that data directory, a release without it refuses the data
directory with `SchemaTooNewError` for as long as nixie stays paused. The error does not say that
the pause is the cause.

Each step marked **Get approval first** stops the live nixie or does something that no later step
puts back. When someone else follows these steps for you, they stop before each such step and ask
you.

Replace these placeholders in each command:

| Placeholder          | Stands for                                                          |
| -------------------- | ------------------------------------------------------------------- |
| `<restore_volume>`   | a volume for the fetched copies: a named volume, or a claim         |
| `<backup_service>`   | the Compose service that runs the backup job                        |
| `<backup_env_file>`  | a file of the `NIXIE_BACKUP_*` variables that your backup job reads |
| `<backup_image>`     | the backup image of your release, by its tag and digest             |
| `<nixie_image>`      | nixie's image of your release, by its tag and digest                |
| `<namespace>`        | the Kubernetes namespace of nixie                                   |
| `<job_name>`         | a backup Job that has not finished                                  |
| `<config_map>`       | the ConfigMap that holds nixie's `config.yaml`                      |
| `<sops_file>`        | one sops file of the deployment                                     |
| `<age_key_file>`     | the age key file that the Compose commands read                     |
| `<new_age_key_file>` | a path that you pick for the restored host's new age key            |
| `<task_id>`          | the ID of one task that `nixie recovery` lists                      |
| `<snapshot_id>`      | the full ID of a data snapshot                                      |

On Compose, set `NIXIE_SECRETS_FILE=<sops_file>` and `NIXIE_AGE_KEY_FILE=<age_key_file>` on each
`docker compose` command, as the [Compose guide](../guides/compose.md) does. Until step 9, the age
key file is your recovery key.

**On a new cluster, deploy nixie without its backup job first.** The restore pod needs the claim
`data-nixie-0`, which exists only once the StatefulSet has run. A backup job beside that empty nixie
would publish its empty database and remove the key store backup that you restore from. With the
Pulumi component, leave out the `backup` argument for now. The reference manifests define no backup
job, so apply them as they are. Then follow step 1.

Each container below mounts `<restore_volume>` at `/restore`, and the fetch writes the copies into
the folder `/restore/pair`, which it creates. The fetch refuses a folder that holds any file, and a
new claim can hold a `lost+found` folder at its root, so the copies never go at the root.

## Restore

### 1. Stop nixie and its backup job

**Get approval first.** This stops nixie and its backup job on the new host or cluster. When the
lost host still runs, stop both there too. A backup job that keeps running can publish, during the
restore, a backup of the database that the restore replaces.

- Compose:

  ```bash
  docker compose stop <backup_service> nixie
  ```

- Kubernetes: scale the StatefulSet to 0:

  ```bash
  kubectl -n <namespace> scale statefulset/nixie --replicas=0
  ```

  When the namespace runs the backup CronJob `nixie-backup`, as the Pulumi component's `backup`
  argument makes it, suspend the CronJob and list its Jobs:

  ```bash
  kubectl -n <namespace> patch cronjob/nixie-backup -p '{"spec":{"suspend":true}}'
  kubectl -n <namespace> get jobs
  ```

  A suspended CronJob starts no Job, but a Job that started before keeps running. Delete each backup
  Job that has not finished with `kubectl -n <namespace> delete job/<job_name>`.

  With the Pulumi component, run no `pulumi up` until step 8, because each `pulumi up` sets
  `suspend: false` on the CronJob again.

Expect: `docker compose ps`, or `kubectl -n <namespace> get pods`, lists no nixie and no backup job.

### 2. Fetch the backup pair

The fetch copies the newest key store backup and the database backup that goes with it out of the 2
repositories. It runs in the backup image, with the backup job's repository variables, and it mounts
only `<restore_volume>`, never nixie's data volume.

- Compose: create the volume and give it to the backup image's user, 10001, then run the fetch.
  `docker compose run <backup_service>` would also mount the service's staging folder on the data
  volume, so the fetch runs through `docker run`:

  ```bash
  docker volume create <restore_volume>
  docker run --rm --user 0:0 --entrypoint chown -v <restore_volume>:/restore <backup_image> 10001:10001 /restore
  docker run --rm --env-file <backup_env_file> -e HOME=/tmp -v <restore_volume>:/restore <backup_image> fetch --to /restore/pair
  ```

- Kubernetes: create a claim named `<restore_volume>` with room for a copy of `nixie.db` and
  `keys.db`. Then save this pod as `nixie-fetch.yaml`. It reads the `nixie-backup` Secret, which the
  Pulumi component creates under that fixed name when it runs the backup job. When no such Secret
  exists, create it with
  `kubectl -n <namespace> create secret generic nixie-backup --from-env-file=<backup_env_file>`. The
  security fields meet the `restricted` Pod Security level that the reference namespace enforces,
  and `fsGroup` gives user 10001 the claim:

  ```yaml
  apiVersion: v1
  kind: Pod
  metadata:
    name: nixie-fetch
  spec:
    restartPolicy: Never
    securityContext:
      runAsNonRoot: true
      runAsUser: 10001
      runAsGroup: 10001
      fsGroup: 10001
      seccompProfile:
        type: RuntimeDefault
    containers:
      - name: fetch
        image: <backup_image>
        args: ['fetch', '--to', '/restore/pair']
        env:
          - name: HOME
            value: /tmp
        envFrom:
          - secretRef:
              name: nixie-backup
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop: ['ALL']
        volumeMounts:
          - name: restore
            mountPath: /restore
          - name: tmp
            mountPath: /tmp
    volumes:
      - name: restore
        persistentVolumeClaim:
          claimName: <restore_volume>
      - name: tmp
        emptyDir: {}
  ```

  Run it, read its log, and delete it, so that the restore pod can mount the claim:

  ```bash
  kubectl -n <namespace> apply -f nixie-fetch.yaml
  kubectl -n <namespace> wait --for=jsonpath='{.status.phase}'=Succeeded --timeout=30m pod/nixie-fetch
  kubectl -n <namespace> logs pod/nixie-fetch
  kubectl -n <namespace> delete pod/nixie-fetch
  ```

  When the fetch fails, the pod ends `Failed` and the wait runs until its timeout. Read the log
  then.

Expect: exit 0 and one `backup.fetched` line, with `"relation":"same-publish"`. That relation means
both backups come from one publish of the backup job, so the key store backup holds the key of every
record in the database backup.

When the fetch fails, it exits 1 with one `backup.fetch_failed` line, which holds the `step` that
failed. When the fetch refused the pair, the line also holds the `refusal` and a `message`. A failed
fetch leaves `/restore/pair` marked as unfinished, and `nixie restore` refuses that folder. Fetch
again into a new folder, such as `/restore/pair-2`, and restore from that folder in step 3.

#### When the refusal is `no-data-of-publish`

A backup job stopped after its key store backup and before its database backup, so the newest key
store backup has no database backup of its own. The `message` holds the ID of the newest database
backup that the key store backup holds every key for, after the words `name data snapshot`.

**Warning: an older database backup loses text.** Read these before you fetch one:

- An item that you forgot after that backup stays unreadable after the restore, because the key
  store never gets a removed key back.
- An item whose evidence nixie
  [purged](../architecture/deployment/backups.md#an-older-data-copy-and-a-purge) after that backup
  loses its text, unless its current version had a version key of its own and stayed current until
  the purge.

**Warning: a key store backup with no publish number.** `nixie-backup snapshots` prints one line of
JSON for each backup, in the backup image, as the fetch runs. When the line of the newest key store
backup shows `"publish":null`, the fetch checks a named database backup only by its `set` number,
and a `set` number can repeat after an earlier restore. Name a database backup whose `set` is the
key store backup's or lower, and whose `time` is earlier than the key store backup's.

Then fetch again into a new folder, with `--data-snapshot` and that ID. On Compose, change the end
of the `docker run` fetch command. On Kubernetes, change the pod's `args`:

```bash
fetch --to /restore/pair-2 --data-snapshot <snapshot_id>
```

Expect: `"relation":"older-data"`, which means the database backup is older than the key store
backup.

### 3. Restore the databases

**Get approval first.** `nixie restore --yes` replaces both databases, so the data written since the
backup is lost.

The restore runs in a one-off container of nixie's image that mounts the data volume, nixie's
`config.yaml` and `<restore_volume>`. It reads no secret and holds no backup credential.

- Compose: run `setup` first. `setup` gives the data volume to nixie's user, creates the backup
  staging folder, and copies the sops file and the age key into the secrets volume. `--no-deps` on
  the restore then keeps Compose from running `setup` again:

  ```bash
  docker compose run --rm --no-deps setup
  docker compose run --rm --no-deps -v <restore_volume>:/restore nixie restore --from /restore/pair --yes
  ```

- Kubernetes: `<config_map>` is `nixie-config` with the manifests. The Pulumi component generates
  the name of its ConfigMap. Read the name from the volume named `config` in the output of
  `kubectl -n <namespace> get statefulset/nixie -o jsonpath='{.spec.template.spec.volumes}'`. Save
  this pod as `nixie-restore.yaml`, then run it as you ran the fetch pod:

  ```yaml
  apiVersion: v1
  kind: Pod
  metadata:
    name: nixie-restore
  spec:
    restartPolicy: Never
    securityContext:
      runAsNonRoot: true
      runAsUser: 10001
      runAsGroup: 10001
      fsGroup: 10001
      seccompProfile:
        type: RuntimeDefault
    containers:
      - name: restore
        image: <nixie_image>
        args: ['restore', '--from', '/restore/pair', '--yes']
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop: ['ALL']
        volumeMounts:
          - name: data
            mountPath: /data
          - name: config
            mountPath: /etc/nixie/config.yaml
            subPath: config.yaml
            readOnly: true
          - name: restore
            mountPath: /restore
          - name: tmp
            mountPath: /tmp
    volumes:
      - name: data
        persistentVolumeClaim:
          claimName: data-nixie-0
      - name: config
        configMap:
          name: <config_map>
      - name: restore
        persistentVolumeClaim:
          claimName: <restore_volume>
      - name: tmp
        emptyDir: {}
  ```

Expect: exit 0, and the line `nixie restored nixie.db and keys.db from /restore/pair`, with the
folder that you restored from.

When the restore stops part way, for a crash or any error, run the same command again. When the
error begins `a backup job pass holds the staging lock`, a backup job still runs. Stop it with step
1, then run the restore again.

### 4. Start nixie

Start nixie, and leave the backup job stopped.

- Compose: name each service but the backup service. Without `--no-deps`, Compose runs `setup`
  before nixie. With the reference recipe:

  ```bash
  docker compose up -d --wait nixie web proxy
  ```

- Kubernetes:

  ```bash
  kubectl -n <namespace> scale statefulset/nixie --replicas=1
  kubectl -n <namespace> rollout status statefulset/nixie
  ```

Expect: nixie starts paused. While nixie is paused, no task works, no action starts, and no schedule
fires. The web client shows that nixie is paused after a restore. A release that does not start
paused fails here: see [Before you start](#before-you-start).

### 5. Read the recovery

Run each `nixie` command in steps 5 to 7 inside nixie's container:

- Compose: `docker compose exec nixie nixie recovery`
- Kubernetes: `kubectl -n <namespace> exec nixie-0 -c nixie -- nixie recovery`

Expect: one line of JSON, `{"recovery":{…}}`, with `restoredAt`, `backupTakenAt` and `toCheck`.
`toCheck` lists each task that was midway through a unit of its work, or that had an action with no
outcome, when the backup was taken. Each entry gives the task's `taskID`, `name` and
`stateAtBackup`. It also gives `wasRunning`, true when such a unit of work had started and not
finished, and `pendingActions`, the number of the task's actions with no outcome.

### 6. Check each listed task

The backup is up to one backup interval older than the lost host, so a task may have acted in the
outside world after the backup. For each task in `toCheck`, check what it may have done since
`backupTakenAt`, such as the mail it sent or the file it changed.

**Warning: a trigger that fired before the backup.** A schedule or an event that fired before the
backup, and that its task had not yet taken, can start a task run once you resume that task or
nixie. Check each task's triggers before you resume it.

To let one task run before the rest, resume it. Resume the conversation to talk to nixie while the
rest stay paused:

```bash
nixie task-resume <task_id>
```

Expect: the task's state, as JSON. The task's Resume button in the web client does the same.

### 7. Resume nixie

**Get approval first.** After the resume, nixie stages backups again. The first backup that the
backup job publishes in step 8 replaces the key store backup that the restore came from, and no
command brings that one back.

```bash
nixie resume
```

Expect: `{"paused":null}`, which means nixie is no longer paused.

### 8. Start the backup job again

- Compose:

  ```bash
  docker compose up -d --wait --no-deps <backup_service>
  ```

- Kubernetes with the Pulumi component: when you left out the `backup` argument on a new cluster,
  put it back. Delete the `nixie-backup` Secret that you created in step 2, so that the component
  can create its own. Then run `pulumi up`, which sets `suspend: false` on the CronJob.
- Kubernetes with a backup CronJob of your own: unsuspend it:

  ```bash
  kubectl -n <namespace> patch cronjob/nixie-backup -p '{"spec":{"suspend":false}}'
  ```

Expect: the next backup job run publishes a backup, with a publish number one above the highest in
either repository.

Then remove `<restore_volume>`, because it holds a copy of the key store.

### 9. Make a host key for the restored host

1. Make a new age key. `age-keygen` prints its public key:

   ```bash
   age-keygen -o <new_age_key_file>
   ```

2. In the deployment repo's `.sops.yaml`, replace the lost host's public key with the new one. Keep
   the recovery key's public key.
3. Re-encrypt each sops file of the deployment to the new recipients:

   ```bash
   sops updatekeys <sops_file>
   ```

4. Commit the change in your deployment repo.
5. Give nixie the new key, then deploy. On Compose, set `NIXIE_AGE_KEY_FILE=<new_age_key_file>`. On
   Kubernetes, put the key in the `age.key` entry of the `nixie-secrets` Secret with the manifests,
   or in the component's `ageKey` argument with Pulumi.
6. Store the recovery key offline again, away from the host.

Expect: `SOPS_AGE_KEY_FILE=<new_age_key_file> sops --decrypt <sops_file> > /dev/null` exits 0.

## Restore from a local copy

**Warning: a local copy brings back forgotten items.** The restore takes the directory's own
`keys.db`, so a directory written before a forget brings the forgotten item's key back. After a
forget that you mean to keep, delete each local copy written before it.

`nixie backup --to <directory>` writes a pair that you can restore without a fetch. Follow steps 1
and 3 to 9, with the volume that holds that directory in place of `<restore_volume>`, and
`--from <directory>` in place of `--from /restore/pair`.

After such a restore, a later fetch with `--data-snapshot` set to a database backup published before
the restore refuses it with `data-unproven`, because the fetch cannot tell whether the key store
holds its keys.

## Drill

A drill restores into a fresh namespace and volume on Kubernetes, to show that the restore works.
Which repository credential a drill reads the repositories with is still open, in
[the restore checks by hand](https://linear.app/zgeoff/issue/GEO-2576). Run no drill until that
issue settles it.

Set up the drill nixie so that it can harm nothing live:

- Set `backup.enabled: false` in its `config.yaml`, and run no backup job. One backup that a drill
  publishes removes every other key store backup, the live one included.
- Give it no sandbox backend that it can reach. At its start, nixie destroys the sandboxes of the
  task work that the restored log shows as ended.

**Get approval first.** Creating the namespace and its volume changes the cluster.

Deploy nixie into the drill's namespace with no backup job, as [Before you start](#before-you-start)
says for a new cluster. Then follow steps 2 to 5 there. Send no message to the drill nixie. The
evidence is the output of `nixie recovery`, the paused tasks it lists, and `nixie health`.
