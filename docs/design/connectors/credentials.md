# The credential store

- Status: Proposed
- Decisions: [0030](../../decisions/0030-connectors-and-sandbox-environments.md),
  [0007](../../decisions/0007-grants-and-taint.md), [0010](../../decisions/0010-memory-store.md),
  [0016](../../decisions/0016-own-interfaces.md),
  [0019](../../decisions/0019-connector-authorization.md),
  [0020](../../decisions/0020-deployment.md),
  [0022](../../decisions/0022-coding-and-code-execution.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

The credential store holds every credential nixie uses: the owner's OAuth clients and their tokens,
static secrets such as API keys and app passwords, and the model credential that imps receive as a
grant, under [0016](../../decisions/0016-own-interfaces.md) and
[0019](../../decisions/0019-connector-authorization.md). Tools and connectors use a credential on
the host through the store, so a credential value never enters a tool result, a prompt, a record or
a log. The store sits in front of one or more backends, and the deployment chooses a backend per
credential. Everything in this doc beyond the decisions it links is a proposal.

## The interface

The shape below is a sketch in TypeScript.

```ts
interface CredentialStore {
  register(spec: CredentialSpec): Promise<CredentialRef>;
  fetcher(ref: CredentialRef, hosts: string[]): AuthorizedFetch; // adds the credential on the host
  grant(ref: CredentialRef, sandbox: Sandbox, rule: InjectRule): Promise<GrantRef>;
  revoke(grant: GrantRef): Promise<void>;
  status(ref: CredentialRef): Promise<CredentialStatus>;
  disconnect(ref: CredentialRef): Promise<void>; // read-only source; stops local use
  reconnect(ref: CredentialRef): Promise<void>; // explicit checked action
  forget(ref: CredentialRef): Promise<void>; // database-owned credentials only
}

interface CredentialSpec {
  kind: 'oauth_client' | 'oauth_token' | 'static' | 'model';
  backend: string; // such as 'database', 'deployment' or 'imp'
  label: string; // such as 'Google, personal'
  hosts: string[]; // where the credential may go, such as 'gmail.googleapis.com'
  expiresAt?: string;
}

interface CredentialBackend {
  id: string;
  read(key: string): Promise<Uint8Array | null>;
  write?(key: string, value: Uint8Array): Promise<void>; // absent on a read-only backend
  delete?(key: string): Promise<void>;
}

interface InjectingBackend {
  id: string; // such as 'imp'
  put(sandbox: string, key: string, value: Uint8Array, rule: InjectRule): Promise<void>;
  replace(key: string, value: Uint8Array): Promise<void>;
  remove(sandbox: string, key: string): Promise<void>;
}
```

A connector never reads a token. It calls the service through `fetcher`, which adds the credential
to each request on the host and refuses any host outside the credential's `hosts` list. The fetcher
drops the credential on a redirect to another host, and refuses private, loopback and link-local
addresses unless the credential's hosts name one. **Why:** a connector that follows a link from an
email or a web page must never carry the owner's token to the address the link names, and a list of
hosts per credential turns that into a check in one place.

A record that mentions a credential holds its reference and a fingerprint: the first 8 hex digits of
a SHA-256 of the value. The fingerprint shows a rotation in the live view without revealing the
value.

## Backends

The deployment maps each credential to a backend, and a credential's row records its backend. The
first build ships 3:

| Backend    | Holds                                                  | Writes | Injects |
| ---------- | ------------------------------------------------------ | ------ | ------- |
| Database   | OAuth clients and tokens, and secrets the owner enters | Yes    | No      |
| Deployment | Static secrets from the deployment, decrypted at start | No     | No      |
| imp        | Copies of the model credential, for grants into imps   | No     | Yes     |

**The database backend** keeps each credential as a row in nixie's database, encrypted with a key of
its own, and wraps each key with a deployment key that the deployment's secrets supply. Forgetting a
credential deletes its key, as [0010](../../decisions/0010-memory-store.md) forgets a memory item.
The rows travel with the database's backups, and the deployment key travels apart from them, so a
backup alone reveals no credential. **Why:** OAuth tokens change at runtime, so they need a backend
that writes, and the database is already the one store the deployment backs up under
[0020](../../decisions/0020-deployment.md).

**The deployment backend** reads static secrets that the deployment supplies, such as the push
notifier's bot token, the search provider's API key and the model credential, from the decrypted
secrets file or the environment at start. It never writes, so the owner rotates such a secret in the
deployment, and nixie reads the new value at its next start.

**The imp backend** injects a value into imp's broker and never stores the source of truth. The
store pushes each value from another backend, with `imp secret add --replace` for a rotation, which
keeps the grant in place, as the [imp broker spike](../../../spikes/imp-broker/README.md) found.

A read-only backend for an outside secret manager can follow behind the same interface. Each one
needs only `read`, so a deployment that keeps its secrets in such a manager reads them at start.

## Grants into a sandbox

A grant puts a credential into a sandbox's broker, limited to one host, so the sandbox's code sends
a placeholder and the broker adds the value. The first build makes one kind of grant: the model
credential, on the model API's host, into the conversation's imp and each worker's imp, under
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md). Any other grant goes only to
a session on a coding adapter, by the owner's rule, under
[0022](../../decisions/0022-coding-and-code-execution.md).

The store refuses 2 kinds of grant whatever a rule says:

- **A grant on a token endpoint,** such as an OAuth provider's `/token` path. imp's broker returns
  the response body unchanged, so a guest that calls a granted token endpoint receives a live access
  token and a refresh token, as the imp broker spike found.
- **A grant of an OAuth client's secret.** The client secret serves only the token endpoint, so the
  store never has a reason to grant it.

Each grant is a record with the sandbox, the credential's reference and fingerprint, and the host.
Destroying the sandbox removes its grants.

## Refresh

The store refreshes OAuth tokens on the host. imp's broker injects a static value and never
refreshes, so the store pushes each new value to every grant that holds it.

- **Before expiry.** The store refreshes an access token 5 min before it expires, by default.
- **On rejection.** A request that the service rejects as unauthorised triggers one refresh and one
  retry. A second rejection marks the credential as failing.
- **One refresh at a time.** The store runs at most one refresh per credential, and every caller
  waiting on it receives the new token.
- **Rotation.** A provider that rotates the refresh token on use, as Microsoft does every time, gets
  the new refresh token written in the same transaction as the refresh's record. **Why:** a crash
  between the refresh and the write would leave only a refresh token the provider has already
  replaced.
- **Keep-alive.** The store refreshes every OAuth token at least once every 7 days, by default, even
  when no tool uses it. Google lets a refresh token lapse after 6 months unused, and Microsoft after
  90 days, so a quiet connection never lapses.

A refresh that the provider refuses for good, such as `invalid_grant` after the owner revoked
access, marks the credential `needs_consent`. nixie writes a record, disables the tools and trigger
sources that need the credential, and puts an item for the owner in the client with a link that
starts the connector's consent again. A refresh that fails for a while, such as during a provider
outage, backs off as a poll does in the [trigger source](../channels/trigger-source.md#polls), and
marks the credential failing after 3 failures in a row.

The model credential follows the deployment's choice of kind. A long-lived OAuth token from
`claude setup-token` lasts one year and never refreshes
([Claude Code authentication](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token)),
so the store records its expiry at setup and puts an item for the owner in the client 14 days before
it, by default. Renewing it needs the owner's browser, so nixie cannot renew it alone.

## Statuses

| Status          | Meaning                                                     | Tools that need it |
| --------------- | ----------------------------------------------------------- | ------------------ |
| `active`        | The last use or refresh succeeded                           | Available          |
| `failing`       | Refreshes or uses fail, and the store retries               | Return an error    |
| `needs_consent` | The provider refused the refresh for good                   | Removed            |
| `expiring`      | A credential that cannot refresh expires within the warning | Available          |
| `disconnected`  | The owner disabled a read-only source binding               | Removed            |
| `forgotten`     | The owner removed it, and its key is deleted                | Removed            |

The client shows every credential with its status, label, scopes, fingerprint and last use. It
offers Disconnect for a read-only source and Forget for a database-owned credential under
[the removal decision](../../decisions/0030-connectors-and-sandbox-environments.md#credential-disconnect-and-forget).
Forgetting a database-owned OAuth token also revokes it with the provider where the provider offers
a revocation endpoint.

## Stop-use before removal

Both Disconnect and database-owned Forget start with the same durable stop-use barrier. A checked
host action disables the binding before cleanup; the store blocks future fetches, refreshes and
grants. Each fetch dispatch, refresh publication and grant replacement rechecks the binding's
removal generation under the shared publication gate. A delayed response from an earlier generation
cannot save a token, create a key or restore an injected grant.

The operation records every grant and nixie-owned credential copy that needs removal, revokes the
grants and deletes those copies. A restart resumes pending cleanup without enabling the binding.
Removal stays pending until the local copies and grants leave. A request that the provider already
received cannot be retracted; local stop-use does not promise cancellation of that request.

For database-owned Forget, the host attempts supported provider revocation before destroying the
canonical credential key. That separately recorded outside action uses the still-readable source
only for this removal operation; it cannot enable ordinary fetches or grants. Its bounded result
appears as confirmed, refused or unknown. An unavailable or failed endpoint does not undo local
stop-use or delay key deletion indefinitely.

Forget then destroys the canonical key under the existing key-store checkpoint and registered-backup
cleanup contract. The store never creates a replacement key or retains a secret copy for a later
revocation retry. The client distinguishes completed local erasure from unsuccessful or unconfirmed
provider revocation, with source-side follow-up where necessary. It never reports provider
revocation as successful without a confirmed outcome.

## Disconnect and reconnect

Disconnect applies the common stop-use phase to a read-only source without deleting or revoking the
external source credential. The disabled binding is keyed by its stable source reference, not its
value fingerprint. Restart, source refresh and secret rotation preserve the disabled state. The
store never calls that source's delete operation or its provider revocation endpoint.

The client shows the disconnected state and explains that the original secret remains at its source.
Reconnect is an explicit checked action that enables the binding after the host validates its
current source and access constraints. It waits for prior cleanup to finish and advances the removal
generation, so an old refresh cannot publish into the reconnected binding. Automatic registration
cannot reconnect a disabled binding. The interface remains a design sketch; the storage and cleanup
implementation need restart and concurrency tests.
