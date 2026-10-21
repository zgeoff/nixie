# Compose reference recipe

The files here run nixie on one host with Docker Compose: nixie and the web client from one release,
each image named by its version tag and digest, and one Caddy origin that sends `/rpc` to nixie and
every other path to the web client. impd runs on the same host as its own stack, outside this
recipe, and nixie reaches it outbound by the URL in `config.yaml`. nixie decrypts its sops secrets
file in its own process at start, so no plaintext secret reaches the container's configuration or
its disk. [The server](../../docs/architecture/deployment/server.md) covers the process and its
secrets.

## Use it

1. Copy this folder into your deployment repo.
2. Replace every placeholder in `config.yaml`: impd's URL, the host's addresses, and the model
   profiles. Add any network your Docker daemon uses outside its default ranges to the egress deny
   list.
3. Replace the persona in `definitions/` with your own.
4. Encrypt your secrets file with sops to your host's age key and your recovery key. It holds the
   deployment key, impd's token and one credential per model profile, in the shape
   [the Kubernetes Secret example](../kubernetes/secret.example.yaml) shows.
5. Start the recipe from the folder, with the paths of the sops file and the host's age key:

   ```bash
   NIXIE_SECRETS_FILE=<sops_file> NIXIE_AGE_KEY_FILE=<age_key_file> docker compose up --wait
   ```

   Expect every service healthy and `setup` exited 0. The `setup` service copies the sops file and
   the age key into a volume that only nixie's user reads, so the host's files stay readable by
   their owner alone.

6. Print a sign-in code, and enter it on the sign-in page:

   ```bash
   NIXIE_SECRETS_FILE=<sops_file> NIXIE_AGE_KEY_FILE=<age_key_file> docker compose run --rm enrol
   ```

   A code signs in one device, once.

The origin listens on `127.0.0.1:8080`. `NIXIE_BIND` and `NIXIE_PORT` set the address and the port.
Put HTTPS for your host name in front of the origin, on loopback or your private network only.

An upgrade changes the tag and the digest of the nixie and web images together, to the pair a
release's notes list. A rollback reverts that change.

## How CI checks it

The Compose workflow runs on each push to main, and on each pull request that changes a file the
recipe or the test build reads. It checks that each pinned tag resolves to its pinned digest. It
then starts the recipe with the overlay in `ci/`, which swaps nixie's release image for the test
build, because the release image leaves the test sandbox out. The test sandbox runs each guest as a
local process with no isolation, so the overlay is never a deployment. The workflow checks the
health URL through the recipe's origin, and that the `enrol` service prints a sign-in code.
