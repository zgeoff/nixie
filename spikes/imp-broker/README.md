# Spike: imp credential broker grants

This spike tests what the imp credential broker can and cannot limit, against imp 0.38.1. The broker
matches a grant by host alone: every method and every path to a granted host gets the credential.
The broker injects a static value and never refreshes an OAuth token. Under policy `none`, a granted
host is the only host an imp reaches, and the imp can send it any data. The audit log keeps one row
per credentialed request, with byte counts but no query, header or body.

## Questions

1. Can a grant be limited by HTTP method and path, so that a grant is read-only?
2. Can the broker refresh an OAuth token, or does it inject only a static credential?
3. Under policy `none` with a grant to one host, does the imp reach that host and nothing else, and
   can it send arbitrary data there?
4. What does the broker record per request?

## Setup

The checks run against a dev impd built from the imp repository at tag `v0.38.1`, never against a
production host. Only a dev instance reads `broker-test-upstreams.json`, the file that sends a
granted hostname to a local server whose certificate verifies against an extra CA
([imp development guide](https://github.com/zgeoff/imp/blob/v0.38.1/docs/guides/development.md#end-to-end-tests)).
TLS verification stays on.

[`mock.ts`](./mock.ts) is the local OAuth server and protected resource. It serves HTTPS on the
Docker bridge address `172.17.0.1:9443`, with a throwaway CA and leaf made by openssl. The token
endpoint takes client credentials over HTTP Basic and issues access tokens that expire after 30 s.
Every path under `/v1/` checks the bearer token. The mock logs each request's method, path, query,
body size and auth scheme, never a token value.

[`run.sh`](./run.sh) maps two fake hostnames to the mock and runs every check:

- `api.nixie-spike.test` is the protected resource, granted through the secret `nixie-spike-api` (a
  bearer access token).
- `auth.nixie-spike.test` is the token endpoint, granted through the secret `nixie-spike-auth` (the
  client secret, as HTTP Basic).

The script creates the imp `nixie-spike-a`, installs curl while the policy is `open`, then sets the
policy to `none` before any grant. It removes the imp, both secrets, the upstreams file and the mock
on exit.

## Run it

1. Clone imp at the tag outside this repository, and copy a built guest kernel to
   `kernel/out/vmlinux` in the clone
   ([imp install guide](https://github.com/zgeoff/imp/blob/v0.38.1/docs/guides/install.md#set-up)).

   ```bash
   git clone --branch v0.38.1 --depth 1 https://github.com/zgeoff/imp <imp_clone>
   cd <imp_clone> && bun install
   ```

2. Start a dev instance with its own name, ports and data directory, off the tailnet:

   ```bash
   export IMP_DEV_NAME=nixie-spike-dev IMP_DEV_PORT_OFFSET=400 IMP_DEV_DATA=<data_dir>
   IMP_DEV_TAILNET=0 scripts/dev.sh up
   ```

3. Run the spike with the instance's URL and token. The script refuses any `IMP_URL` that is not
   `http://localhost:*`, so a run never reaches the saved default host.

   ```bash
   export IMP_URL=http://localhost:7470 IMP_TOKEN=$(scripts/dev.sh token) SPIKE_WORK=<scratch_dir>
   bash <nixie_repo>/spikes/imp-broker/run.sh
   ```

4. Read the host image tag, stop the instance, and remove what it made. `dev.sh down` removes both
   containers and keeps the image. The data directory holds a root-owned `imp.xfs`, which `rm -rf`
   deletes because you own the directory.

   ```bash
   docker inspect -f '{{.Config.Image}}' nixie-spike-dev
   scripts/dev.sh down
   docker rmi <dev_host_image>
   rm -rf <data_dir> <scratch_dir> <imp_clone>
   ```

## Results

Output of one run, with token values cut short:

```text
== Q3: the granted host answers through the broker under policy none
{"ok":true,"method":"GET","receivedBytes":0}
200
== Q3: an ungranted host through the broker
curl: (56) CONNECT tunnel failed, response 403
== Q3: a direct connection that skips the broker
curl: (7) Failed to connect to 1.1.1.1 port 443 after 0 ms: Couldn't connect to server
== Q3: POST a 1 MiB body, a query string and a custom header to the granted host
{"ok":true,"method":"POST","receivedBytes":1048576}
200
== Q1: other methods and paths on the granted host carry the credential
{"ok":true,"method":"DELETE","receivedBytes":0}
200
{"ok":true,"method":"PUT","receivedBytes":1}
200
== Q4: a Host header for another name
this connection is for api.nixie-spike.test
421
== Q2: the guest asks the token endpoint; the broker adds the client credentials
{"access_token":"at-cc49…","token_type":"Bearer","expires_in":30,"refresh_token":"rt-7f2b…"}
200
== Q2: wait past the 30 s expiry of the granted access token
{"error":"expired_token"}
401
== Q2: a host-side refresh replaces the secret; no grant changes
{"ok":true,"method":"GET","receivedBytes":0}
200
```

The mock saw the guest's data on the exfiltration request:

```text
{"method":"POST","path":"/v1/messages","query":"?leak=guest-data","bodyBytes":1048576,"auth":"Bearer","exfilHeader":"guest-data"}
```

`imp audit nixie-spike-a` listed 7 rows, one per credentialed request that reached the upstream:

```text
SECRET            METHOD  HOST                   PATH                 STATUS  BYTES       MS
nixie-spike-api   GET     api.nixie-spike.test   /v1/resource         200     0/44        1
nixie-spike-api   GET     api.nixie-spike.test   /v1/resource         401     0/25        2
nixie-spike-auth  POST    auth.nixie-spike.test  /oauth/token         200     29/154      1
nixie-spike-api   PUT     api.nixie-spike.test   /v1/admin            200     1/44        1
nixie-spike-api   DELETE  api.nixie-spike.test   /v1/anything/at/all  200     0/47        1
nixie-spike-api   POST    api.nixie-spike.test   /v1/messages         200     1048576/51  4
nixie-spike-api   GET     api.nixie-spike.test   /v1/resource         200     0/44        3
```

## Answers

Source links point at imp tag `v0.38.1`.

### 1. Method and path limits

A grant cannot be limited by method or path. The run sent `DELETE /v1/anything/at/all` and
`PUT /v1/admin` to the granted host, and the upstream received both with the bearer token.

The source has no field for either limit:

- [`BrokerRuleSchema`](https://github.com/zgeoff/imp/blob/v0.38.1/packages/api/src/secret-schema.ts#L34-L44)
  holds `host`, `header`, `scheme` and `user` only.
- The broker front sends a `CONNECT` to the terminator when the port is 443 and a grant covers the
  host
  ([`broker-front.ts:268`](https://github.com/zgeoff/imp/blob/v0.38.1/packages/daemon/src/broker/broker-front.ts#L268)).
- The terminator's forwarder looks up the credential by imp and host, sets the header, and sends the
  request's own method, path and query upstream
  ([`forward-request.ts:74-122`](https://github.com/zgeoff/imp/blob/v0.38.1/packages/daemon/src/broker/forward-request.ts#L74-L122)).

A change would add optional `methods` and `paths` (path prefixes) to `BrokerRuleSchema`, with CLI
flags on `imp secret add --kind custom`. `findCredential` in
[`broker-service.ts`](https://github.com/zgeoff/imp/blob/v0.38.1/packages/daemon/src/broker/broker-service.ts#L314-L330)
would return them with the header. The forwarder would check `request.method` and `url.pathname`
right after the lookup at `forward-request.ts:74`, and answer 403 with an audit row on a miss. The
new fields would join the secret's binding, so changing them would need `--rebind`. The path check
has to match the pathname after URL parsing, and it has to decide what to do with encoded slashes
(`%2F`), which parsing leaves in place.

### 2. OAuth refresh

The broker injects a static value and never refreshes it. Once the 30 s access token expired, the
granted request got `401 expired_token`. The broker has no refresh, OAuth or expiry code:
`findCredential` reads the value file that the secret's row names and renders it into the header
([`broker-service.ts:314-330`](https://github.com/zgeoff/imp/blob/v0.38.1/packages/daemon/src/broker/broker-service.ts#L314-L330)).

A refresher outside the imp works with the broker as it is. The script fetched a fresh token on the
host and ran `imp secret add --replace`. The next request returned 200, and the grant stayed in
place, because a replace with the same binding is a rotation
([connectors guide](https://github.com/zgeoff/imp/blob/v0.38.1/docs/guides/connectors.md#rotate-or-rebind)).
A refresher has to replace the value before each expiry. Requests in the gap between expiry and
replace fail.

A grant on the token endpoint leaks tokens into the imp. The broker added the client credentials to
the guest's `POST /oauth/token`, and the response body, with a live access token and a refresh
token, went back to the guest unchanged. The broker never inspects or rewrites a response body, so a
grant must never cover a token endpoint.

### 3. Reach and exfiltration under policy `none`

The imp reached the granted host and nothing else. The broker refused a `CONNECT` to `example.com`
with 403. A direct connection to `1.1.1.1:443` failed at once. The granted host stayed reachable, as
the
[imp networking doc](https://github.com/zgeoff/imp/blob/v0.38.1/docs/architecture/networking.md#egress)
states.

The imp can send arbitrary data to the granted host. A 1 MiB random body, a query string and a
custom request header all reached the upstream with the credential attached. Any account that the
credential reaches is a channel out: the imp can write data to it with the user's identity, and
anything else that can read that account receives the data. nixie has to treat every granted host as
an open outbound channel for whatever the imp holds.

### 4. What the broker records

The broker writes one audit row per credentialed request that reaches the forwarder's upstream call:
time, imp, secret, method, host, path without the query, status, request and response bytes, and
duration
([`AuditEntrySchema`](https://github.com/zgeoff/imp/blob/v0.38.1/packages/api/src/secret-schema.ts#L76),
[`forward-request.ts:82-95`](https://github.com/zgeoff/imp/blob/v0.38.1/packages/daemon/src/broker/forward-request.ts#L82-L95)).
An upstream failure records status 502.

The audit log leaves out:

- the query string, every header and both bodies: the run's `?leak=guest-data` and `x-exfil` header
  appear nowhere in the audit
- a request refused for a wrong `Host` header: the run's 421 left no row
- a request refused for a missing grant: the 403 returns before the audit write
  ([`forward-request.ts:74-78`](https://github.com/zgeoff/imp/blob/v0.38.1/packages/daemon/src/broker/forward-request.ts#L74-L78))
- every plain tunnel to an ungranted host, and every refused `CONNECT`

The log keeps the newest 1000 rows per imp, and `imp rm` deletes an imp's rows
([connectors guide](https://github.com/zgeoff/imp/blob/v0.38.1/docs/guides/connectors.md#secrets-and-grants)).
`imp audit --json` returns the rows for export. A decision record that needs more than 1000 rows, or
rows that outlive the imp, has to copy them out.

## Untested

- The 403 for a missing grant comes from source only. Producing it needs a request to reach a
  terminator between a revoke and the terminator's stop.
- The guest never used the refresh token from the token endpoint. The leaked access token answers
  the question on its own.
- The run never checked a WebSocket upgrade or HTTP/2 to a granted host. The connectors guide states
  that the terminator serves HTTP/1.1 only.
