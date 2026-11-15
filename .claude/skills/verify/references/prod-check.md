# The prod check

Check the owner's nixie after a release deploys: the doctor reads its version, its health and its
error lines, and three commands read its API with a token that cannot write. The deploy job runs the
same doctor after each apply, with no model call.

The target is read-only, and nixie refuses a write with the token too. A command that would write
fails with exit 3 and `read-only`; leave it undone and report the command.

## Set it up

The two credentials sit in the `nixie` 1Password vault. Read each into the command's environment,
and never print one:

| Variable                | Holds                                                | Where                                                |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `NIXIE_PROD_URL`        | the web origin of the owner's nixie                  | ask the repo's maintainer                            |
| `NIXIE_PROD_TOKEN`      | the read-only API token                              | item `nixie-prod-read-token`, field `credential`     |
| `NIXIE_PROD_KUBECONFIG` | the path of a kubeconfig that only reads nixie's pod | item `nixie-prod-kubeconfig`, file `kubeconfig.yaml` |
| `NIXIE_PROD_VERSION`    | optional: the version you expect, such as `0.74.0`   | the release you are checking                         |

Write the kubeconfig to a file outside the repo, such as one in your scratch folder, and remove it
when you finish.

## Run it

```bash
bun verify use --target prod
bun verify attach
bun verify doctor
bun verify prod health
bun verify prod conversation
bun verify prod tasks
bun verify detach
```

Expect from `doctor`: `data.passed: true`, with `prod-version`, `prod-health` and `prod-errors`
passed. Expect from each `prod` command: exit 0, and a count in `data`.

When a doctor check fails:

- `prod-version`: the pod runs another version than you expect, or the rollout has not finished.
  Wait for the deploy, then run `doctor` again.
- `prod-health`: nixie reports `degraded` or `unready`, and names each failing part. Report it.
- `prod-errors`: nixie logged an error line in the last hour. The message names each event; report
  them.

A `prod` command reads the API, so it fails with `environment` without `NIXIE_PROD_URL` or
`NIXIE_PROD_TOKEN`. The deploy job sets neither, and runs the doctor alone.

**Reply:** the doctor's result for each check, the counts from the three reads, and each command
that failed with its `error.code`.
