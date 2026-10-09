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
  forget(ref: CredentialRef): Promise<void>;
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
| `forgotten`     | The owner removed it, and its key is deleted                | Removed            |

The client shows every credential with its status, its label, its scopes, its fingerprint and its
last use, and the database backend supports forgetting through key deletion. Removal of a credential
supplied by a read-only backend remains an owner choice below; the client does not promise erasure
of an external source. Forgetting an OAuth token also revokes it with the provider where the
provider offers a revocation endpoint.

## Read-only credential removal — owner choice

A deployment or outside manager can supply a credential that nixie can read but cannot erase. The
deployment owns that source under 0016 and 0020. The platform must not claim that deleting its
reference erases the source, its history or the provider's copy. Automatic registration at restart
also needs a rule that prevents an owner-removed binding from returning silently.

Options:

- **Disconnect in nixie.** The proposed checked action disables the binding durably, blocks future
  fetches and grants, revokes existing grants and cleans up nixie-owned copies. A tombstone prevents
  startup or source refresh from silently reconnecting it. The client names this "Disconnect" and
  shows that the original credential remains at its source. Reconnection needs an explicit checked
  action. This does not retract requests a provider already received.
- **Require a source change first.** The client explains where the secret lives and waits for the
  owner to remove or revoke it there before nixie removes the binding. This preserves the external
  source as the only control, but splits a removal request across tools and delays nixie's stop-use
  path.

Recommendation: Disconnect for read-only sources, and crypto-shredding Forget for database-owned
credentials. The trade-off is a deliberate local override beside the source's configuration and two
clearly different guarantees in the client. The behavior and names remain unchosen; the backend
interface sketch is not an implemented removal API.
