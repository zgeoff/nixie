# Spike: the reverse forward from a pod

A nixie stand-in in a k3s pod reaches impd on the node over an outbound HTTPS connection, and an imp
with egress `none` reaches the stand-in's tools through a reverse forward on that connection. The
pod declares no container port, has no Service, and holds no listening TCP or UDP socket at any
point in the run. impd reports the imp's policy as `none` before and after the tool calls, and the
guest's own connections to impd, its gateway and the internet fail.

## Question

Can nixie in a pod reach impd outbound, and does imp return the guest's connections over that link
while the imp's egress stays `none`?

## Versions and shape

| Component            | Version                                         |
| -------------------- | ----------------------------------------------- |
| impd                 | 0.40.0                                          |
| `@zgeoff/imp-client` | 0.40.0                                          |
| Bun                  | 1.4.2                                           |
| k3s                  | 1.35.8, one node                                |
| Guest image          | imp's base image 0.29.0, with `bash` and `curl` |

impd runs on the node, outside the cluster, in imp's own host container. It publishes its API on the
node's loopback and serves it over HTTPS on the tailnet. The node's firewall drops traffic to the
loopback port and to the container's bridge address from any interface but their own, so the pod
reaches impd only through the tailnet HTTPS name. The tailnet policy allows the cluster's nodes to
reach impd's node on port 443 for the cluster's health probe of impd. The run changes no firewall,
tailnet or impd setting.

[`nixie.ts`](nixie.ts) is the stand-in. It serves its tools on a unix socket in the pod, so the pod
never listens on a network port. It then:

1. creates an imp named `nixie-spike-*` with egress `none`, through an impd token limited to
   `manage` on `nixie-spike-*`
2. opens a reverse forward from `127.0.0.1:8901` in the imp with `openReverseForward`, over a
   WebSocket to impd's `/tunnel`
3. relays each forwarded connection to the unix socket
4. runs `curl` in the guest over impd's exec, which uses the guest agent's vsock and not the guest's
   network
5. destroys the imp and prints one JSON line per step

The tool endpoint answers a JSON-RPC `tools/call` and checks a bearer token that is random for each
run. The [tools-reverse-forward spike](../tools-reverse-forward/) covers the Claude Agent SDK and
the MCP transport over the same relay; this spike covers the link from the pod.

## Run it

1. Build the image from this folder and import it into the node's containerd:

   ```bash
   docker build -t localhost/nixie-spike:pod-reverse-forward .
   docker save localhost/nixie-spike:pod-reverse-forward | ssh <node> k3s ctr images import -
   ```

2. Create the namespace, then create the impd token straight into a Secret on the node, so the token
   never appears in a command line or a terminal:

   ```bash
   kubectl create namespace nixie-spike
   imp token new nixie-spike --scope manage --imps 'nixie-spike-*' \
     | kubectl -n nixie-spike create secret generic imp-token --from-file=token=/dev/stdin
   ```

3. Create the run's ConfigMap and start the pod from [`pod.yaml`](pod.yaml):

   ```bash
   kubectl -n nixie-spike create configmap nixie-spike \
     --from-literal=IMP_URL=https://<impd_tailnet_name> \
     --from-literal=SPIKE_IMP=nixie-spike-conv-<run_id> \
     --from-literal=SPIKE_IMAGE=<impd_image_with_curl>
   kubectl apply -f pod.yaml
   ```

4. Read the run with `kubectl -n nixie-spike logs nixie`. Each check line carries `"pass":true` or
   `"pass":false`, and the script reports `ok` as false when any check fails. Expect
   `{"step":"done","ms":…,"data":{"ok":true}}` as the last line. The pod stays up after the run, so
   you can read its spec with `kubectl -n nixie-spike get pod nixie -o yaml` and
   `kubectl -n nixie-spike get svc,endpointslices`.
5. Clean up: `kubectl delete namespace nixie-spike`, `imp token rm nixie-spike`, and
   `k3s ctr images rm localhost/nixie-spike:pod-reverse-forward` on the node. The script destroys
   its own imp, and it refuses an imp name that exists.

## Findings

[`record/run.jsonl`](record/run.jsonl) holds the recorded run and
[`record/cluster.txt`](record/cluster.txt) holds the pod's spec and the namespace's resources while
the pod ran. The stand-in replaces impd's host name and address with `<impd-host>` and
`<impd-address>` in its output.

| Check                                       | Result                                                   |
| ------------------------------------------- | -------------------------------------------------------- |
| Client and impd versions                    | 0.40.0 and 0.40.0, compatible                            |
| imp policy after create                     | `none`, no allow entries                                 |
| Forward listens in the imp                  | `127.0.0.1:8901`, 1.6 s after the script starts          |
| Tool call from the guest                    | HTTP 200, `{"sum":42,"servedBy":"nixie-pod"}`            |
| Tool call without the bearer token          | HTTP 401                                                 |
| Streamed response                           | first chunk, then the last chunk 247 ms later            |
| 50 sequential tool calls, after 10 warm-ups | median 13.0 ms, 95th percentile 20.7 ms                  |
| Guest to impd by name                       | `curl` exit 6: the name does not resolve                 |
| Guest to impd's address on 443              | `curl` exit 28: timed out after 5 s                      |
| Guest to its gateway on impd's port         | `curl` exit 28: timed out after 5 s                      |
| Guest to an internet address                | `curl` exit 7: refused at once                           |
| imp policy after the calls                  | `none`, no allow entries                                 |
| Pod listening sockets                       | none before the forward, while it was open, and after it |
| Pod spec and namespace                      | no `hostNetwork`, no container port, no Service          |

The tool round trip runs guest → impd → the tailnet → the pod, and each `curl` start adds to it. The
pod reaches impd's address on 443 for the whole run, while the guest fails to reach that address and
port. The gateway and internet failures have no positive control from the same imp, because the
spike creates its imps only with egress `none`. 2 earlier runs on the same setup gave the same
results, with medians of 13.3 ms and 10.9 ms.

## Limits

The run covers one node, with nixie's pod and impd on the same host, and sequential calls only. It
does not cover a sleep and wake of the imp, an impd restart, or the pod's restart while a forward is
open: the [tools-reverse-forward spike](../tools-reverse-forward/) covers the reopen after a wake.
The pod's route to impd depends on the tailnet policy grant to impd's node on port 443 and on public
DNS for impd's name, which the deployment repo holds.
