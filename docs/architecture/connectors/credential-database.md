# The credential database

A Google connection holds a refresh token that nixie changes at runtime: each refresh can replace
it. The credential store's database backend keeps these values in `nixie.db`, sealed under keys of
the key store, so that forgetting a connection deletes its keys and leaves nothing readable in the
database or in any backup. For the backend's interface, the removal counter and the refresh, see
[the credential store](credentials.md). Read on for where the database backend keeps each value, how
a rotated token survives a crash, and how a connection is forgotten.

For the key store, see [erasable fields](../core/erasable-fields.md). For why every key ID is
random, see [the database](../core/database.md#key-store-ids).

## Tables and keys

The connections module owns three tables and writes every one of them.

| Table           | Holds                                                                           | Sealed under                             |
| --------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| `oauth_clients` | the client's public ID, its secret, its removal counter                         | a key of the client's own                |
| `connections`   | the account, the refresh token, the status, the binding and the removal counter | the account key, and a token key         |
| `key_marks`     | each key ID that may belong to no row                                           | nothing: a mark holds an ID and no value |

Each sealed value binds its key ID, its table and its column as additional data, so a value copied
to another row or column fails to open. The account and the refresh token of a connection sit under
two keys, because a rotation replaces the token key and never the account key. A connection keeps
its row after a forget, with its short ID and no sealed value, so a job pin can still name it.

The access token never reaches a table. The backend keeps it in memory under the credential ID and
the removal counter, so a restart costs one refresh at the next use. Until then `readToken` returns
no access token, and the store refuses to send an empty one.

The removal counter outlives the values it guards. A removal advances the counter and keeps the row,
so a binding made before the removal never matches again.

## Writing a token

`writeToken` seals the refresh token, then commits the row, the token's record and the key marks in
one write transaction. The transaction first compares two removal counters with the ones the caller
read: the credential's own, and its OAuth client's. A client removed after the caller's last check
therefore never gets a token saved, and the save answers `removed`. A refresh that finishes after a
removal revokes the token it received.

The transaction writes `credential.refresh_saved` with the token, so a crash leaves both or neither.
A start never finds a saved token whose refresh reads as lost.

## Rotation and the key sweep

The key store and `nixie.db` commit apart, so a key ID needs a mark that survives a crash between
the two. The backend writes the mark before it makes the key. In the token's transaction, it clears
the mark of the new key, because a row now names it, and writes a mark for the key it replaced.
After the commit, the refresh deletes the old key and its mark.

A crash at any point then leaves one whole token in the row, and a mark for each key that may be
left over:

| The process dies                              | The row holds | The start does                                               |
| --------------------------------------------- | ------------- | ------------------------------------------------------------ |
| after the new key, before its start is logged | the old token | deletes the new key: no refresh is open, so the token stands |
| after the new key, before the request answers | the old token | marks the credential `needs_consent`, deletes the new key    |
| after the provider answers, before the commit | the old token | the same: the provider may have spent the old token          |
| after the commit, before the old key goes     | the new token | deletes the old key                                          |

A sweep deletes each marked key that no row, no unfinished `credential.refresh_started` and no save
in flight names. It runs at each start, after the lost refreshes are closed, and every hour. The
hourly sweep runs beside live refreshes, so it skips the keys that its own process made and has not
yet committed. A key that has left that set already has the row that names it.

## Forget

Forgetting a connection is an erasure of the kind `credential` on the
[erasure runner](../core/erasable-fields.md#forgetting-a-record). The start transaction advances the
removal counter, sets the binding to `removing`, and captures the account key and the token key. The
store refuses every fetch and refresh from then on, and a fetch in flight is aborted with the
removal's error.

The forget cleans no session and removes no logged request, because no token enters either.

The runner then calls the connection's revoke step, after the sandboxes are destroyed and before any
key is deleted:

1. The step reads the token, which only a revocation can still read, and sends the refresh token to
   the provider's revoke URL once. Status 200 alone is `confirmed`, 400 is `refused` with an error
   code from a fixed set, and any other answer or none is `unknown`. A connection with no token or
   no client secret is `not_attempted`.
2. The step writes `connection.revocation_recorded` with the outcome. The runner deletes the keys
   only after this record commits.
3. The runner deletes the keys, and the connection's sealed columns are cleared and its binding is
   set to `removed`.

The revocation is sent at most once, because a second request could revoke a grant that a later
consent made. At start, before the runner's catch-up runs, nixie writes `unknown` for each forget
that began and has no outcome record, because its request may have left before the crash. A retry in
the same process finds the outcome recorded, or finds that this process already sent the request,
and sends nothing. The forget finishes on every outcome, so a revocation that fails still ends with
the keys deleted.

A backup that holds `nixie.db` from before the forget holds the sealed values and no key. The backup
job prunes the key repository after the forget, so no backup holds a key that opens them. A restic
suite of the backup job checks this against the repositories.

## Tests

The credential crash suites in the server's `e2e/` folder kill the process at each point of the
table above and at three points of the forget: after the forget's start commits and before its
revocation, after the provider receives the revocation and before its outcome is recorded, and after
the outcome is recorded and before the keys go. They check the row, the exact keys that remain, the
number of revoke requests and the outcome record after the restart. The connections module's own
tests run the same cases in process, with the runner's `erasure.revoked` fault point.
