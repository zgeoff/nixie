# Preview recipe

The files here run a throwaway nixie for one pull request: a test build of the branch's source, the
web client, and one origin in front of both. Each new Compose project starts with a fresh database
and a fresh deployment key, and holds invented data only.

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

`NIXIE_PREVIEW_BIND` and `NIXIE_PREVIEW_PORT` set the origin's address and port. The address
defaults to `0.0.0.0`, so a preview environment's proxy reaches the origin from outside its host.

## Check a turn through the API

To confirm a turn from its records, enrol a device with the sign-in code through `sessions/enrol`,
send one message with `conversation/send`, and read the conversation with `conversation/read`: its
`owner_message`, each `model.reply`, `model.turn_ended` and the `task.step_*` records of its step.
The [preview API check](../docs/runbooks/preview-api-check.md) gives each request and a worked turn.

## Model calls

The preview's model profile names a placeholder credential. A model call reaches the model's API
only through a host credential broker that adds the real credential on the way out, so no key enters
the preview. `compose.yaml` reads the broker from the host's environment: `HTTPS_PROXY` holds its
proxy, and `SSL_CERT_FILE` the CA bundle that holds the certificate its proxy signs with. An imp
sets both, so every `docker compose` command there keeps the broker in place. Without them, nixie
starts and reports ready, and each turn fails at its model call.

A host that caps each preview's model spend with a
[counting proxy](../docs/architecture/policy/counting-proxy.md) of its own sends the model API's
host to that proxy and names the preview's route in `PREVIEW_MODEL_ROUTE`. nixie then runs on a copy
of `config.yaml` with the route on the end of each model profile's base URL.

## Files

- `compose.yaml` runs nixie, the `enrol` service, the web client and the Caddy origin.
- `config.yaml` selects the test sandbox and the preview's model profile, with its model's prices.
- `run-preview.sh` writes the throwaway secrets file on the first start and the routed copy of the
  config when a host names a model route, then runs nixie.
