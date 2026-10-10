# The credential store

- Decisions: [0016](../../decisions/0016-own-interfaces.md),
  [0007](../../decisions/0007-grants-and-taint.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0030](../../decisions/0030-connectors-and-sandbox-environments.md)

The credential store holds every credential nixie uses: OAuth clients and their tokens, static
secrets such as API keys and app passwords, and the model credential that imps receive as a grant.
Tools and connectors use a credential on the host through the store, so a credential value never
enters a tool result, a prompt, a record or a log. The store sits in front of one or more backends,
and the deployment picks the backend for each credential.

## The interface

```ts
interface CredentialStore {
  register(spec: CredentialSpec): Promise<CredentialRef>;
  fetcher(ref: CredentialRef, hosts: string[]): AuthorizedFetch; // adds the credential on the host
  grant(ref: CredentialRef, sandbox: Sandbox, rule: InjectRule): Promise<GrantRef>;
  revoke(grant: GrantRef): Promise<void>;
  status(ref: CredentialRef): Promise<CredentialStatus>;
  disconnect(ref: CredentialRef): Promise<void>; // read-only source: stops local use
  reconnect(ref: CredentialRef): Promise<void>; // a checked action
  forget(ref: CredentialRef): Promise<void>; // database-owned credentials only
}

interface CredentialSpec {
  kind: 'oauth_client' | 'oauth_token' | 'static' | 'model';
  backend: string; // such as 'database', 'deployment' or 'imp'
  label: string; // such as 'Google, personal'
  hosts: string[]; // where the credential may go
  expiresAt?: string;
}
```

A connector never reads a token. It calls the service through `fetcher`, which adds the credential
on the host and refuses any host outside the credential's `hosts`. The fetcher drops the credential
on a redirect to another host, and refuses private, loopback and link-local addresses that the hosts
do not name. **Why:** a connector that follows a link from an email must never carry your token to
the address the link names.

A record that mentions a credential holds its reference and a fingerprint, the first 8 hex digits of
a SHA-256 of the value, so the live view shows a rotation without the value.

## Backends

| Backend    | Holds                                                | Writes | Injects |
| ---------- | ---------------------------------------------------- | ------ | ------- |
| Database   | OAuth clients and tokens, and secrets you enter      | Yes    | No      |
| Deployment | Static secrets from the deployment, read at start    | No     | No      |
| imp        | Copies of the model credential, for grants into imps | No     | Yes     |

- **Database.** Each credential is a row encrypted with a key of its own, wrapped by a deployment
  key from the deployment's secrets, so a backup alone reveals no credential. OAuth tokens change at
  runtime, so they need a backend that writes.
- **Deployment.** The decrypted secrets file or the environment supplies static secrets at start.
  You rotate them in the deployment, and nixie reads the new value at its next start. A read-only
  backend for an external secret manager follows the same shape.
- **imp.** The store pushes each value into imp's broker, and replaces it on rotation without
  touching the grant.

## Grants into a sandbox

A grant puts a credential into a sandbox's broker, limited to one host, so the sandbox's code sends
a placeholder and the broker adds the value. The first build makes one kind of grant: the model
credential, on the model API's host, into the conversation's imp and each worker's imp. Any other
grant goes only to a session on a coding adapter, by your rule for the coding context.

The store refuses 2 grants whatever a rule says:

- **A grant on a token endpoint.** imp's broker returns the response body unchanged, so a guest that
  calls a granted token endpoint receives live tokens, as the
  [imp broker spike](../../../spikes/imp-broker/README.md) found.
- **A grant of an OAuth client's secret,** which serves only the token endpoint.

Each grant is a record with the sandbox, the credential's reference and fingerprint, and the host.
Destroying the sandbox removes its grants.

## Refresh

The store refreshes OAuth tokens on the host, 5 min before expiry by default, and pushes each new
value to every grant that holds it, because imp's broker never refreshes. A rejected request gets
one refresh and one retry. The store runs one refresh per credential at a time, and writes a rotated
refresh token in the same transaction as the refresh's record, so a crash never leaves only a spent
token. Every OAuth token refreshes at least every 7 days, by default, so a quiet connection never
lapses.

A refresh the provider refuses for good, such as `invalid_grant`, marks the credential
`needs_consent`, disables the tools and polls that need it, and puts an item in the client that
starts consent again. A long-lived model token from `claude setup-token` never refreshes, so the
client warns 14 days before its expiry, by default.

## Statuses

| Status          | Meaning                                                     | Tools that need it |
| --------------- | ----------------------------------------------------------- | ------------------ |
| `active`        | The last use or refresh succeeded                           | Available          |
| `failing`       | Refreshes or uses fail, and the store retries               | Return an error    |
| `needs_consent` | The provider refused the refresh for good                   | Removed            |
| `expiring`      | A credential that cannot refresh expires within the warning | Available          |
| `disconnected`  | You disabled a read-only source binding                     | Removed            |
| `forgotten`     | You removed it, and its key is deleted                      | Removed            |

The client shows every credential with its status, label, scopes, fingerprint and last use. It
offers Disconnect for a credential from a read-only source and Forget for a credential in the
database.

## Disconnect and forget

A binding is the link between a connector and the credential it uses. Disconnect and Forget both
start by disabling the binding in a checked host action, and from then on the store refuses every
fetch, refresh and grant for it.

Each binding carries a removal counter, which every removal and every reconnect advances. The store
checks the counter just before a fetch sends its request and again when a fetch, a refresh or a
grant replacement saves its result, under the same lock on the binding that the removal takes.
**Why:** a request or a refresh that started before the removal can neither send with the credential
nor save a token after it. A request the provider already received stays with the provider.

The store then revokes every grant and deletes every copy of the credential that nixie holds. A
restart resumes this cleanup, and the removal shows as pending until every copy and grant is gone.

- **Disconnect** keeps the external secret at its source, and nixie never deletes or revokes it. The
  disabled state is keyed by the source reference, so a restart, a source refresh or a secret
  rotation never reconnects it. Reconnect is a checked action that waits for the cleanup and
  advances the counter.
- **Forget** applies to a credential in the database. It makes one attempt at the provider's
  revocation, an action with an outcome of confirmed, refused or unknown, then destroys the
  credential's key, including the copies in every registered backup, as
  [forgetting a memory item](../memory/store.md) does. The client shows the local erasure apart from
  the provider's revocation, and never reports a revocation without a confirmed outcome.
