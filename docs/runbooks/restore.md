# Restore nixie on a new host

These steps take you from a lost host to a restored nixie that you have checked and resumed, with
backups running again. They cover Compose, Kubernetes with the reference manifests, and Kubernetes
with the Pulumi component.
[Backup and restore](../design/platform/deployment/backup-and-restore.md#restoring-on-a-new-host)
gives the design, and [the backup pair](../design/queue/backup-pair.md) gives the fetch and the
restore.

## Before you start

You need:

- both restic repositories, the data repository and the key repository, and the password of each;
- your deployment repo;
- your recovery key, the age key that opens the deployment's secrets files;
- a release that has the pause and writes the restore note.

**Release.** Restore only with a release that has the pause and writes the restore note. A release
without the pause refuses to start on the restore marker. While nixie is paused, it refuses with
`SchemaTooNewError`, whose text does not say why. Pin the release that has the pause in your
deployment repo before step 3.

Replace these placeholders in each command:

| Placeholder        | Stands for                                                                          |
| ------------------ | ----------------------------------------------------------------------------------- |
| `<restore_volume>` | a volume that holds only the pair: a named volume on Compose, a claim on Kubernetes |
| `<backup_service>` | the Compose service that runs the backup job                                        |
| `<namespace>`      | the Kubernetes namespace of nixie                                                   |
| `<job_name>`       | the name of a backup Job that has not finished                                      |
| `<backup_image>`   | the backup image of the release, by its tag and digest                              |
| `<nixie_image>`    | nixie's image of the release, by its tag and digest                                 |
| `<config_map>`     | the ConfigMap that holds nixie's `config.yaml`                                      |
| `<sops_file>`      | the deployment's sops file; `<age_key_file>` is the recovery key's file             |
| `<task_id>`        | the ID of one task from `nixie recovery`                                            |
| `<snapshot_id>`    | the full ID of a data snapshot, from `nixie-backup snapshots`                       |

On Compose, set `NIXIE_SECRETS_FILE=<sops_file>` and `NIXIE_AGE_KEY_FILE=<age_key_file>` on each
`docker compose` command, as the [Compose guide](../guides/compose.md) does. The commands below show
only the command.

Each pod and container below mounts `<restore_volume>` at `/restore`, and the pair goes in the
folder `/restore/pair`, which the fetch creates. The fetch refuses a folder that holds any file, and
a new claim can hold a `lost+found` folder at its root.

## Restore

Do the steps in order. Each step that nothing undoes starts with a **Get approval first** line.

### 1. Stop nixie and its backup job

**Get approval first.** The live nixie stops, and the backup job stops with it. Stop both before the
fetch, because a job pass that publishes during the restore can publish a set staged from the
replaced database.

- Compose:

  ```bash
  docker compose stop <backup_service> nixie
  ```

- Kubernetes: scale the StatefulSet to 0, suspend the backup CronJob, and list its Jobs:

  ```bash
  kubectl -n <namespace> scale statefulset/nixie --replicas=0
  kubectl -n <namespace> patch cronjob/nixie-backup -p '{"spec":{"suspend":true}}'
  kubectl -n <namespace> get jobs
  ```

  Suspending the CronJob does not stop a Job that already runs. Delete each Job that has not
  finished with `kubectl -n <namespace> delete job/<job_name>`, then wait until
  `kubectl -n <namespace> get pods` lists none of its pods.

  The Pulumi component sets `suspend: false` on the CronJob again at each `pulumi up`, so run no
  `pulumi up` until step 8.

Expect: no nixie container or pod, and no backup job container or pod.

### 2. Fetch the pair

Fetch the newest key snapshot and the data snapshot that belongs with it. Create `<restore_volume>`
first. It is a separate volume that the fetch container and the restore container both mount, so the
fetch container never mounts the data volume.

- Compose: Docker creates the volume owned by root, but the fetch runs as user 10001. The first
  `docker compose run` gives the volume to that user, through the `setup` service, which runs as
  root. The fetch then runs in the backup service's image, which holds the repositories' variables
  and passwords:

  ```bash
  docker volume create <restore_volume>
  docker compose run --rm --no-deps --entrypoint chown -v <restore_volume>:/restore setup 10001:10001 /restore
  docker compose run --rm --no-deps -v <restore_volume>:/restore <backup_service> fetch --to /restore/pair
  ```

- Kubernetes: create a claim named `<restore_volume>` of a few gigabytes, then run the fetch in a
  one-off pod of the backup image, with the `nixie-backup` Secret, which the component and a
  deployment's own backup job both keep under that fixed name. `fsGroup: 10001` gives the fetch's
  user write access to the claim:

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

  Apply it, read its log, then delete it, so the restore pod can mount the claim. When the pod ends
  `Failed`, the wait times out: read the log all the same.

  ```bash
  kubectl -n <namespace> apply -f nixie-fetch.yaml
  kubectl -n <namespace> wait --for=jsonpath='{.status.phase}'=Succeeded --timeout=30m pod/nixie-fetch
  kubectl -n <namespace> logs pod/nixie-fetch
  kubectl -n <namespace> delete pod/nixie-fetch
  ```

The fetch exits with one log line:

- Exit 0 prints `backup.fetched`, with the snapshot IDs, the set and publish numbers of each copy,
  and the `relation` of the pair. `same-publish` is the pair of one publish. `older-data` is a data
  snapshot from before the key snapshot.
- Exit 1 prints `backup.fetch_failed`, with the `step` that failed and, when the pick refused, the
  `refusal`.

A failed fetch leaves its unfinished-backup marker, and `nixie restore` refuses that directory.
Empty the folder or use a new one before you fetch again.

When the refusal is `no-data-of-publish`, a publish stopped between its 2 snapshots. Its message
holds the ID of the newest data snapshot that the key snapshot vouches for. List the snapshots to
see it among the others, then fetch again with that ID:

```bash
nixie-backup snapshots
nixie-backup fetch --to /restore/pair --data-snapshot <snapshot_id>
```

On Compose, run both through
`docker compose run --rm --no-deps -v <restore_volume>:/restore <backup_service>`, as above. On
Kubernetes, change the pod's `args`. `snapshots` prints one line of JSON for each snapshot of both
repositories.

**Warning: a data snapshot named under a key snapshot with no publish number.** The fetch checks
that snapshot only by its `set-` number.

**Warning: an `older-data` pair.** The restored nixie loses the text of an item whose evidence it
[purged](../design/queue/evidence-purge.md#backups) after the data snapshot, unless the item's
current version had a version key of its own and stayed current until the purge. An item forgotten
after the data snapshot stays unreadable, because the key store never gets a deleted key back.

### 3. Restore

**Get approval first.** `nixie restore` replaces both databases, so the data written since the
backup is lost.

Run it in a one-off container of nixie's image that mounts the data volume, the configuration and
`<restore_volume>`. The container holds no backup credential, and the restore reads only the
configuration, not the secrets file.

- Compose: run the `setup` service first. It gives nixie's user the data volume and fills the
  secrets volume, and `--no-deps` on the restore container skips it:

  ```bash
  docker compose run --rm --no-deps setup
  docker compose run --rm --no-deps -v <restore_volume>:/restore nixie restore --from /restore/pair --yes
  ```

- Kubernetes: run a one-off pod of nixie's image on the claim `data-nixie-0`. `<config_map>` is
  `nixie-config` with the reference manifests. The Pulumi component names its ConfigMap itself, so
  read the name from the StatefulSet:

  ```bash
  kubectl -n <namespace> get statefulset/nixie -o jsonpath='{.spec.template.spec.volumes}'
  ```

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
    containers:
      - name: restore
        image: <nixie_image>
        args: ['restore', '--from', '/restore/pair', '--yes']
        volumeMounts:
          - name: data
            mountPath: /data
          - name: config
            mountPath: /etc/nixie/config.yaml
            subPath: config.yaml
            readOnly: true
          - name: restore
            mountPath: /restore
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
  ```

  Apply it, wait for it and read its log as for the fetch pod, then delete it.

Expect: exit 0, with the databases restored and the directory they came from.

The restore takes the writer lock, so it refuses while a server runs. It then moves the databases,
empties the backup staging folder, and writes the restore note. After a kill or a failure at any of
those points, run the restore again. When it fails because the backup job holds the staging lock,
the backup job is still running. Stop it, then run the restore again.

### 4. Start nixie

Start the release that has the pause. Do not start the backup job.

- Compose: name every service but the backup service, and leave out `--no-deps`, so that Compose
  runs `setup` again before nixie starts. With the reference recipe:

  ```bash
  docker compose up -d --wait nixie web proxy
  ```

- Kubernetes:

  ```bash
  kubectl -n <namespace> scale statefulset/nixie --replicas=1
  kubectl -n <namespace> rollout status statefulset/nixie
  ```

Expect: nixie ready and paused, and the client showing the restore. A release without the pause
fails here, as [Before you start](#before-you-start) says.

### 5. Read the recovery

Run `nixie recovery` in nixie's container:

```bash
docker compose exec nixie nixie recovery
```

On Kubernetes, use `kubectl -n <namespace> exec nixie-0 -c nixie -- nixie recovery`. Steps 6 and 7
run their commands in nixie's container the same way.

Expect: JSON with the restore time and the backup time, and each task to check. Each task shows its
`stateAtBackup`, whether it `wasRunning` a step that had not committed, and the number of its
`pendingActions`, the actions with no outcome.

### 6. Check each listed task

A restored log is up to one backup interval behind the lost host, so an action may have run after
the backup. Check each listed task against the outside world, such as the mail it sent or the file
it changed.

To let one task run before the rest, such as the conversation so that you can talk to nixie, resume
that task:

```bash
nixie task-resume <task_id>
```

The task's Resume in the client does the same.

**Warning: a fire written before the backup and never read.** It can start a task run once you
resume that task.

### 7. Resume nixie

**Get approval first.** After the resume, nixie stages sets again, and the first publish replaces
the key snapshot that the restore came from. Nothing undoes that.

```bash
nixie resume
```

Expect: the pause state, null once nixie runs.

**Warning: a fire written before the backup and never read.** It can start a task run once you
resume nixie.

### 8. Start the backup job again

- Compose:

  ```bash
  docker compose up -d --wait --no-deps <backup_service>
  ```

- Kubernetes: with the manifests, unsuspend the CronJob. With the Pulumi component, run `pulumi up`,
  which sets `suspend: false`.

  ```bash
  kubectl -n <namespace> patch cronjob/nixie-backup -p '{"spec":{"suspend":false}}'
  ```

Expect: the next scheduled pass publishes a set, with a publish number one above the highest in
either repository. Remove `<restore_volume>` once you have no more use for the fetched pair.

### 9. Make a host key for the restored host

1. Make a new age key for the restored host.
2. Add its public key to both secrets files:

   ```bash
   sops updatekeys <sops_file>
   ```

3. Commit the change in your deployment repo.
4. Put the recovery key away.

## Restore from a local copy

`nixie backup --to <directory>` writes a pair that you can restore without a fetch. Run steps 1 and
3 to 9, with the volume that holds that directory in place of `<restore_volume>`, and
`--from <directory>` in place of `--from /restore/pair`.

**Warning: a forgotten item.** The restore takes that directory's own `keys.db`, so a directory
taken before a forget brings the forgotten item's key back. After a forget that you mean to keep,
delete each local copy taken before it.

The restore note then holds no key snapshot ID, so the next publish makes every earlier data
snapshot `data-unproven` for later fetches.

## Drill

A drill restores into a fresh namespace and volume on Kubernetes, to show that a restore works. Set
it up so that it can harm nothing live:

- Backups stay off, and the drill runs no backup job. A drill's publish removes every other key
  snapshot, the live one included.
- The drill reaches no sandbox backend. The start part `recovery` destroys sandboxes.

**Get approval first.** Creating the namespace and its volume changes the cluster.

Follow steps 2 to 5. The drill sends no turn, and its evidence is `nixie recovery`, the paused task
list, and `nixie health`. Which repository credential a drill uses is open, in
[the restore checks by hand](https://linear.app/zgeoff/issue/GEO-2576).
