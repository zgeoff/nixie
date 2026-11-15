# The prod check

After a release deploys, check the nixie that runs in production through the `prod` target of
`bun verify`. Hand back each doctor check's result and each read's result.

`prod` holds a real person's data, so you only read it:

- Run only the commands on this page. `bun verify` refuses each other command that changes data on
  `prod`, with exit 3 and `error.code` `read-only`. Leave a refused command undone, and report it.
- Never send nixie a message, by any route. A message becomes a turn of a real conversation.

## Set it up

Pass these variables to every `bun verify` command, such as by an `export` in the same shell call.
The `op` commands need the `nixie` vault; when `op` fails to sign in, report the check as blocked.

| Variable                | Holds                                                   | Needed by                                      |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| `NIXIE_PROD_KUBECONFIG` | the path of a kubeconfig that can only read nixie's pod | `doctor`, `prod health`                        |
| `NIXIE_PROD_URL`        | the web origin of the production nixie                  | `prod conversation`, `prod tasks`              |
| `NIXIE_PROD_TOKEN`      | an API token that nixie lets only read                  | `prod conversation`, `prod tasks`              |
| `NIXIE_PROD_VERSION`    | the version you check, such as `0.74.0`                 | `doctor`, which accepts any version without it |

1. Write the kubeconfig to your scratch folder, outside the repo:

   ```bash
   op read op://nixie/nixie-prod-kubeconfig/kubeconfig.yaml --out-file "<scratch>/prod-kubeconfig.yaml"
   ```

   Set `NIXIE_PROD_KUBECONFIG` to that path.

2. Set the token without printing it:
   `NIXIE_PROD_TOKEN="$(op read op://nixie/nixie-prod-read-token/credential)"`.
3. Ask your caller for `NIXIE_PROD_URL`. Without it, run the doctor and `prod health` only, and
   report the other two reads as not run.
4. Set `NIXIE_PROD_VERSION` to the version your caller names, without a leading `v`.

## Run it

1. Run `bun verify use --target prod`.
2. Run `bun verify attach`. Expect: `ok: true`.
3. Run `bun verify doctor`. Expect: `data.passed: true`. When a check fails, follow
   [When the doctor fails](#when-the-doctor-fails), and come back here once `doctor` passes.
4. Run `bun verify prod health`. Expect: `data.status` is `ready`.
5. Run `bun verify prod conversation`. Expect: a `data.recordCount`, of any size.
6. Run `bun verify prod tasks`. Expect: a `data.taskCount`, of any size.
7. Run `bun verify detach`, and remove the kubeconfig file. Do this step after a failure too.

## When the doctor fails

Read the failed check's `message` in `data.results`:

- `prod-version`: the pod runs another version, or its rollout has not finished. Run `doctor` again
  each minute. After 10 minutes, report the version in the message, and go to step 7.
- `prod-health`: nixie is `degraded` or `unready`. Report the status and each failing part in the
  message, and go to step 7.
- `prod-errors`: nixie logged an error line since its container started, up to an hour back. Report
  each event name in the message, and go to step 7.

**Reply:** each doctor check's result, the status and the two counts from the reads, and each
command that failed or was refused, with its `error.code` or its check's message.
