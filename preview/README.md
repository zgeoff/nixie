# Preview recipe

The files here run a throwaway nixie for one pull request: a test build of the branch's source, the
web client, and one origin in front of both. Each new Compose project starts with a fresh database
and a fresh deployment key, and holds invented data only, so a preview never touches a real
deployment.

The preview runs every sandbox in the test sandbox, which runs each guest as a local process beside
nixie. The test sandbox is not a security boundary: a guest reads whatever nixie's user can and
reaches any network the container reaches. Run a preview only on a host that holds nothing a guest
must not reach, such as an imp of its own.

## Run it

1. Start the preview from this folder. On a PC, keep the origin on the loopback address, so the test
   sandbox stays off your network:

   ```bash
   NIXIE_PREVIEW_BIND=127.0.0.1 docker compose up --build --wait
   ```

   Expect every service healthy and `enrol` exited 0.

2. Read the sign-in code that the `enrol` service printed, and enter it on the sign-in page at
   `http://127.0.0.1:8080`:

   ```bash
   docker compose logs --no-log-prefix enrol
   ```

   A code signs in one device, once. Run `docker compose run --rm enrol` for another.

3. Check the health URL, `http://127.0.0.1:8080/health/ready`. Expect HTTP 200 with every part
   ready.

4. Stop the preview and delete its data:

   ```bash
   docker compose down --volumes
   ```

`NIXIE_PREVIEW_BIND` and `NIXIE_PREVIEW_PORT` set the address and port the origin listens on. The
address defaults to `0.0.0.0`, every interface, so a preview environment's proxy reaches the origin
from outside its host.

## Model calls

The preview's model profile names a placeholder credential, and the first start writes it into a
plain secrets file beside the throwaway key. A model call reaches the model's API only through a
host credential broker that adds the real credential on the way out, so no key enters the preview.

`compose.yaml` reads the broker from the host's environment: `HTTPS_PROXY` names the broker's proxy,
and `SSL_CERT_FILE` the CA bundle that holds the certificate its proxy signs with. An imp sets both,
so every `docker compose` command there, `docker compose run --rm enrol` too, keeps the broker in
place. Without them, nixie starts and reports ready, and each turn fails at its model call.

A preview host can cap each preview's model spend with a
[counting proxy](../docs/architecture/policy/counting-proxy.md) of its own. Its broker then sends
the model API's host to that proxy, and `PREVIEW_MODEL_ROUTE` in the host's environment names the
preview's route. The preview's model profile holds its model's list prices in the price table shape
that a proxy route reads, with the long-prompt prices where the model has them. The server's preview
route step reads `config.yaml` through the deployment schema, adds the route to the end of each
model profile's base URL in a copy, and refuses a route that is not a lowercase slug, so every model
call carries the route. Without the variable, nixie runs on `config.yaml` as it stands.

## Files

- `compose.yaml` runs nixie, the `enrol` service, the web client and the Caddy origin, and routes
  nixie's model calls through a host's broker. CI runs it on each push to main, and on each pull
  request that changes a file the preview reads.
- `config.yaml` selects the test sandbox and the preview's model profile, with its model's prices.
- `run-preview.sh` writes the throwaway secrets file on the first start, writes the routed copy of
  the config when a host names a model route, then runs nixie.
