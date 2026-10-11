# Run the live checks

The live checks in `e2e/k3s/` run against a nixie deployed on Kubernetes from the
[reference manifests](../architecture/deployment/kubernetes.md). They reach nixie by its URL and the
cluster by a kubeconfig, and each suite skips until the variables it needs are set:

| Suite                   | Checks                                                         | Needs                                  |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------- |
| `conversation.test.ts`  | enrol, send a message, and get a reply that used the web fetch | the URL and the kubeconfig             |
| `rollout.test.ts`       | the old pod stops before the new pod opens the database        | the kubeconfig and an image to roll to |
| `fetch-sandbox.test.ts` | a fetch sandbox reaches public pages and nothing internal      | the kubeconfig and an impd token       |

The conversation check calls the model of the conversation's profile, which its provider bills. The
rollout check restarts nixie twice.

## Before you start

1. Check out the release tag that the deployment runs, such as `v0.1.0`, and run `bun install`. The
   fetch check parses nixie's configuration with the schema of the checkout, so a checkout of
   another release can refuse a valid file.
2. Install `kubectl`, and get a kubeconfig whose user may read pods, nodes and Services, read pod
   logs, exec into nixie's pod, and patch the StatefulSet in nixie's namespace.
3. Check that nixie answers ready before any check:

   ```bash
   kubectl --kubeconfig <kubeconfig> -n nixie exec nixie-0 -c nixie -- bun /app/main.js health
   ```

   Expect exit code 0. A check against an unready nixie fails on its first wait.

## Set the variables

| Variable                     | Holds                                                                      |
| ---------------------------- | -------------------------------------------------------------------------- |
| `NIXIE_LIVE_URL`             | the origin the ingress serves nixie on, such as `https://<host>`           |
| `NIXIE_LIVE_KUBECONFIG`      | the path of the kubeconfig                                                 |
| `NIXIE_LIVE_NAMESPACE`       | nixie's namespace, `nixie` when unset                                      |
| `NIXIE_LIVE_KUBECTL`         | the kubectl binary, `kubectl` from the path when unset                     |
| `NIXIE_LIVE_ROLL_IMAGE`      | a nixie image by digest that the StatefulSet does not run                  |
| `NIXIE_LIVE_IMPD_TOKEN`      | an impd token with manage scope on `nixie-*`                               |
| `NIXIE_LIVE_TAILNET_ADDRESS` | a tailnet address with a listener on port 80, `100.100.100.100` when unset |

A variable that is set but malformed, such as a roll image with no digest, fails the run at once
instead of skipping a suite.

### An image to roll to

The rollout check needs a digest the StatefulSet does not run, and a different release would also
change the schema or the client. Build a copy of the running image that differs only in a label, and
push it to a registry the cluster pulls from:

```bash
printf 'FROM %s\nLABEL org.heynixie.live-check=%s\n' '<running_image>' "$(date +%s)" \
  | docker build -t <registry>/nixie:live-check -
docker push <registry>/nixie:live-check
docker buildx imagetools inspect <registry>/nixie:live-check --format '{{json .Manifest.Digest}}'
```

Set `NIXIE_LIVE_ROLL_IMAGE` to `<registry>/nixie:live-check@<digest>`.

### An impd token

Create a token that manages sandboxes named `nixie-*` on the impd that nixie uses, and pass it in
the environment without printing it. The fetch check creates its sandboxes with it, records them in
a database of its own, and destroys them when each test ends.

## Run the checks

Run every suite from `e2e/k3s`, whose `bunfig.toml` leaves out the web test preload. From the repo
root, the preload's mock server takes over `fetch`, and every call to nixie fails.

```bash
cd e2e/k3s
NIXIE_LIVE_URL=<nixie_url> \
NIXIE_LIVE_KUBECONFIG=<kubeconfig> \
NIXIE_LIVE_ROLL_IMAGE=<roll_image> \
NIXIE_LIVE_IMPD_TOKEN=<impd_token> \
bun test conversation.test.ts rollout.test.ts fetch-sandbox.test.ts
```

Expect `0 fail` and no skipped test. Run one suite by naming only its file and setting only its
variables.

## What each failure means

- **The conversation check** fails when the turn's records miss a step or come out of order, when a
  step errored, or when the reply lacks the page's heading `Example Domain`. Read the turn's records
  in the web client, and nixie's log with `kubectl logs nixie-0 -c nixie`.
- **The rollout check** fails when the old pod exits non-zero, when its `stopped` line or its end
  comes after the new pod's `writer.started` line, or when the new epoch is not higher. A missing
  `stopped` line means the runtime killed nixie before it stopped: compare the pod's stop grace with
  the runner pools' grace in [the server](../architecture/deployment/server.md#stopping).
- **The fetch sandbox check** fails when an address of the cluster falls outside the configuration's
  `imp.host_addresses` and `imp.egress_deny`, when a probe connects, or when the control probe to
  `1.1.1.1` fails. Each failed probe line holds its host and port.

## Clean up

The rollout check sets the StatefulSet back to the image it found and waits for that rollout, even
when the check fails. A run that you stop with Ctrl-C skips that step: set the image back with
`kubectl -n nixie set image statefulset/nixie nixie=<running_image>`.

The same stop leaves the fetch check's sandboxes on impd. Their names, `nixie-<id>`, match nixie's
own sandboxes, so list them with impd's API and remove only those created while the run ran. nixie's
own fetch and conversation sandboxes are older, unless nixie restarted during the run. Revoke the
impd token, and delete the live-check image from the registry.

The conversation check revokes the device session it enrolled when it ends, and its message and the
reply stay in the conversation.
