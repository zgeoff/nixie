# Compose reference recipe

The files in [`deploy/compose/`](../../deploy/compose/) run nixie on one host with Docker Compose:
nixie and the web client from one release, each image named by its version tag and digest, and one
Caddy origin that sends `/rpc` to nixie and every other path to the web client. impd runs on the
same host as its own stack, outside this recipe, and nixie reaches it outbound by the URL in
`config.yaml`. nixie decrypts its sops secrets file in its own process at start, so no decrypted
secret reaches the container's configuration or its disk.
[The server](../architecture/deployment/server.md) covers the process and its secrets.

## Use it

1. Copy `deploy/compose/` into your deployment repo.
2. Replace every placeholder in `config.yaml`: impd's URL, the host's addresses, and the model
   profiles. Keep `harness: agent-sdk` on each profile, because nixie refuses a profile with no
   harness. Add any network your Docker daemon uses outside its default ranges to the egress deny
   list.
3. Replace the persona in `definitions/` with your own. Keep or edit the starter rules in
   `definitions/rules/starter.yaml`. `definitions/nixie.yaml` holds format 2, which leaves rule
   files unapplied. To apply them, set `format: 3`. The next seed applies every rule in the files at
   once. [The definitions format](../architecture/core/definitions.md#the-definitions-format)
   describes each format.

   `config.yaml` holds `computer: {}`, which keeps the assistant's computer on. The image that
   `compose.yaml` pins keeps the code tool on, and refuses a `code` section. When you run a release
   that switches the code tool by config, add `code: {}` to `config.yaml` to keep it.

4. Encrypt your secrets file with sops to your host's age key and your recovery key. It holds the
   deployment key, impd's token and one credential per model profile, in the shape of
   [the Kubernetes Secret example](../../deploy/kubernetes/secret.example.yaml).
5. Start the recipe from your copy of the folder, with the paths of the sops file and the host's age
   key:

   ```bash
   NIXIE_SECRETS_FILE=<sops_file> NIXIE_AGE_KEY_FILE=<age_key_file> docker compose up --wait
   ```

   Expect every running service healthy, and `setup` exited 0. The `setup` service copies the sops
   file and the age key into a volume that only nixie's user reads, and the host's files stay
   readable by their owner alone.

6. Print a sign-in code, and enter it on the sign-in page:

   ```bash
   NIXIE_SECRETS_FILE=<sops_file> NIXIE_AGE_KEY_FILE=<age_key_file> docker compose run --rm enrol
   ```

   A code signs in one device, once.

The origin listens on `127.0.0.1:8080`. `NIXIE_BIND` and `NIXIE_PORT` set the address and the port.
Put HTTPS for your host name in front of the origin, on loopback or your private network only.

Clients open the watch socket at `/rpc/computer/watch-stream`, with a one-use ticket in the query.
The recipe's Caddyfile writes no access log, but Caddy writes the request address into its error log
when nixie is down, so the Caddyfile filters each bearer ticket out of every log line: the `ticket`
query parameter, and the last path segment of a device page's frame and image URLs under
`/rpc/device/frames/` and `/rpc/device/images/`. When you add an access log, or put a proxy with its
own log in front, drop those parts of the address from each log line too.

The `/rpc*` rule sends the socket to nixie, and Caddy carries WebSocket upgrades without more
settings.

To upgrade, change the tag and the digest of nixie and web together, and of the backup image when
the deployment runs one, to the values in the release's notes. To roll back, revert that change.
Follow the [upgrade runbook](../runbooks/upgrades.md) for the steps.

## Turn on the phone

The phone is on only when `config.yaml` holds a `phone` section. When your deployment repo is
public, keep the number and the Twilio IDs out of it: each of the 3 takes a `deployment:<name>`
reference to an entry in the `settings` group of the sops secrets file, and the API key's secret
takes one to an entry in `connector_credentials`.

1. Add the entries to the secrets file, and encrypt it again:

   ```yaml
   connector_credentials:
     twilio: <api_key_secret>
   settings:
     phone_number: '+61411111111'
     twilio_account_sid: AC00000000000000000000000000000000
     twilio_api_key_sid: SK00000000000000000000000000000000
   ```

2. Add the section to `config.yaml`:

   ```yaml
   phone:
     number: deployment:phone_number
     twilio:
       account_sid: deployment:twilio_account_sid
       api_key_sid: deployment:twilio_api_key_sid
       credential: deployment:twilio
   ```

3. Start nixie. Expect it to refuse to start, and to name the key, when a reference has no entry.

A plain value in the config still works.
[The assistant's phone](../architecture/connectors/phone.md#configuration) describes each key.

## How CI checks it

The Compose workflow runs on each push to main, and on each pull request that changes a file the
recipe or the test build reads. It checks that each pinned tag resolves to its pinned digest, on
main and on a pull request that changes the recipe, because an upstream rebuild of a tag moves its
digest with no change to the recipe.

The workflow then starts the recipe with the overlay in `deploy/compose/ci/`, which swaps nixie's
release image for the test build, because the release image leaves the test sandbox out. The test
sandbox runs each guest as a local process with no isolation, so the overlay is never a deployment.
The workflow checks the health URL through the recipe's origin, and that the `enrol` service prints
a sign-in code. The overlay adds the `nixie-backup` container, built from the checkout, and the
workflow checks that nixie records a set that the container shipped.

The workflow checks the `config.yaml` that the repo ships beside each recipe, Compose and
Kubernetes, against the config schema of the release that recipe pins, because a deployment that
copies the recipe runs that release. It fetches the schema from the release's `config.schema.json`
asset.

The workflow also checks that the proxy hands on the forwarded protocol and host that the HTTPS
proxy in front of it sends, because nixie builds the image URLs of a device page from them. Last, it
stops nixie, sends requests with a fixture ticket through the origin, and checks that the proxy's
error log holds no ticket.
