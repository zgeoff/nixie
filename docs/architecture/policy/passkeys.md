# Passkeys

A passkey check stands between the user and each high-risk approval. The risk class `always_ask`
covers a proposal that spends money, raises a budget, or adds a mandate, a proposed rule or a known
contact. The class `lifting` covers a proposal that creates or widens a rule that lets nixie skip
those asks. To approve either, the client asks the user's passkey for a WebAuthn assertion with user
verification, bound to the one answer the user gives, and the API refuses the answer without it.

A passkey here is a WebAuthn discoverable credential, whether one device holds it or a provider
syncs it between the user's devices. `@simplewebauthn/server` verifies each response and
`@simplewebauthn/browser` runs the browser's prompt. The package `modules/api` holds the check in
`src/passkey/`.

## The passkeys table

The table `passkeys` holds one row for each registered passkey, live or revoked. The API writes it
directly, as it writes the identity record, and no log record rebuilds it.

| Column                                        | Holds                                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `passkey_id`                                  | a random UUID                                                        |
| `credential_id`, `public_key`                 | the credential's base64url ID and the COSE key from the attestation  |
| `user_handle`                                 | 32 random bytes that every row shares                                |
| `rp_id`, `origin`                             | the hostname and the origin the passkey registered on                |
| `sign_count`                                  | the last counter the passkey reported                                |
| `backup_eligible`, `backed_up`                | the BE flag at registration and the BS flag at the last use          |
| `transports`, `aaguid`                        | the response's transports as JSON, and the provider's ID             |
| `label`                                       | 1 to 64 characters                                                   |
| `registered_by`                               | the registering session's identity ID, with no foreign key           |
| `authorized_by`                               | `code`, or the ID of the passkey whose assertion allowed the passkey |
| `registered_at`, `last_used_at`, `revoked_at` | when it registered, was last used and was revoked                    |

## Which answers take the passkey

- `approve` and `always_allow` on a row whose risk class is `always_ask` or `lifting` take the
  passkey. `defer` and `decline` never do.
- The server builds each row's `passkeyChoices` from its risk class and its choices, as the choices
  that `approve` or `always_allow` take, and returns them on `approvals.listItems` and
  `approvals.readProposals`. The client asks the passkey before it sends one of these choices. The
  server checks the answer against the row, never against what the client sends.
- Always allow on a routine row takes no passkey, because the answer's rule hash pins the one rule
  it creates. The row offers Always allow only for a routine action, so a high-risk row never
  reaches the check with it. A row of a later kind that offers Always allow on a high-risk proposal
  takes the passkey with no further change.
- `approvals.answerProposals` has no field for an assertion, so it refuses each answer that takes
  the passkey with `PASSKEY_REQUIRED`, whether or not a passkey is live.
- An answer through a [host command](../deployment/host-commands.md) takes no passkey and writes no
  `passkey.used`, because whoever runs a host command can already read the database and the key
  store.

## The answer check

The passkey step runs after step 4 and before step 5 of the
[answer checks](approvals.md#the-answer), in the transaction that applies the answer. It refuses in
this order:

1. No passkey is live: `NO_PASSKEY`.
2. The answer carries no assertion: `PASSKEY_REQUIRED`.
3. The check fails: `PASSKEY_FAILED` with the reason.

A refusal from the step writes nothing under the client action ID, and the hash of a checked
action's input leaves out `passkey`. A retry with the same ID and a fresh assertion therefore runs
every check again. A passed check writes `passkey.used` and moves `sign_count`, `backed_up` and
`last_used_at` in the same transaction, so a handler that then fails rolls them back. A kind that
opens its own transaction runs the passkey check inside its guard, after the guard repeats the
checks, and a passkey refusal there skips the second transaction that stores other refusals.

The proposals module takes the gate as a hook. A device route passes a check, a host route passes a
host marker, and a route that passes neither is refused with `PASSKEY_REQUIRED` on a choice that
takes the passkey.

## Challenges

`passkeys.challenge` takes the check it is for: an answer with its proposal ID, action hash, choice
and, for Always allow, rule hash; a `register` check; or a `revoke` check for one passkey. It
refuses with `NO_PASSKEY` when no passkey is live. Otherwise it returns options with the RP ID of
the live passkeys, an empty `allowCredentials`, `userVerification: 'required'` and a timeout of 5
minutes.

- A challenge is the SHA-256 of 32 random bytes, the session's identity ID and the canonical form of
  its check. The server keeps the bytes and the check in memory.
- A challenge works once: the first verification, passed or failed, removes it. A challenge another
  session's assertion carries stays for the session that asked.
- A challenge lapses after the challenge lifetime, which the options' `timeout` matches. A restart
  drops every challenge and costs the user one more tap.

## Verification

`PasskeyCheck.verify(tx, caller, binding, assertion)` runs in the caller's write transaction and
returns the passkey's ID or `PASSKEY_FAILED` with one reason:

| Reason                 | Meaning                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `unknown_passkey`      | no live passkey holds the credential ID                                   |
| `unknown_challenge`    | the challenge was never issued, used, lapsed or issued to another session |
| `binding`              | the challenge was issued for another check                                |
| `origin`               | the client data's origin or the RP ID hash differs from the passkey's     |
| `no_user_verification` | the UV flag is not set                                                    |
| `counter`              | either counter is nonzero and the new one is not greater                  |
| `signature`            | the signature, or anything else WebAuthn verifies, fails                  |

The check reads the passkey row inside the transaction, so a revoke that commits first refuses the
answer. The expected origin is the passkey's `origin`, and the expected RP ID hash is the SHA-256 of
its `rp_id`. Two counters of zero pass, because a synced passkey reports zero on every assertion.

## Registering

A host command prints a one-time code, and the API keeps only its hash in memory. A code works once
and lapses after the code lifetime, and a second code replaces the first.

- With no live passkey, `passkeys.registrationOptions` needs a host code and refuses without one as
  `CODE_REQUIRED`, or as `CODE_INVALID` for a code that is wrong, used or lapsed. This also covers
  recovery after every passkey is lost.
- While a live passkey exists, the call takes either a host code or an assertion on a `register`
  challenge. The assertion's verification writes `passkey.used`.
- The RP ID is the hostname of the call's `Origin` header. The origin must be `https` with a domain
  name. A missing header, plain `http` or an IP address is `ORIGIN_UNSUPPORTED`. While a live
  passkey exists, another origin is `ORIGIN_CHANGED`. To move nixie to a new hostname, revoke every
  passkey from the host, then register with a host code on the new name.
- At most 10 passkeys are live at once, and an 11th is `TOO_MANY_PASSKEYS`. The origin and the cap
  are checked before the code or the assertion, so a refused call leaves the code unused.
- The options ask for a discoverable credential with user verification and `attestation: 'none'`,
  and list every live passkey in `excludeCredentials`. A new passkey gets the `user_handle` of the
  existing rows, live or revoked, or 32 fresh random bytes when none exists.
- The options bind to the session that asked, lapse after the challenge lifetime and work once.
  `passkeys.register` verifies the response with user verification required. Inside its write
  transaction it checks the cap again and, when an assertion authorized the options, that the
  authorizing passkey is still live. Otherwise it fails with `REGISTRATION_FAILED`, so a revoked
  passkey never adds another.
- A registration writes the row and `passkey.registered`, whose `label` is an
  [erasable field](../core/erasable-fields.md). The label defaults to the session's label, or
  `Passkey` when it has none.

A synced passkey and a passkey on one device are both accepted, and `passkeys.list` shows which from
the BE flag.

## Revoking

- `passkeys.revoke` from a client needs an assertion on a `revoke` challenge for that passkey, from
  any live passkey, the one being revoked included. It writes `revoked_at` and `passkey.revoked` in
  one transaction.
- A revoke through `nixie passkeys revoke` needs no passkey and records `host` as the revoker.
- A revoke changes no proposal: a waiting approval stays pending, and any live passkey can approve
  it. Revoking the last live passkey leaves the client unable to approve always-ask rows until a
  host code registers another.

## Reset and restore

A [reset](../core/event-log.md#the-reset) keeps every live passkey and deletes every revoked one.
The `passkey.*` records go with the rest of the old log. A restore brings back the passkeys of the
backup, so a passkey revoked after that backup is live again, and the user revokes it again.

## Deployment

WebAuthn needs HTTPS with a certificate that the browser trusts. A self-signed certificate that the
browser does not trust fails, and a click past the warning page does not help. A name on a private
network works when the certificate is trusted, because the RP ID only has to be a domain that equals
the page's hostname.

## Records

| Kind                  | Fields                                             | Written when                                |
| --------------------- | -------------------------------------------------- | ------------------------------------------- |
| `passkey.registered`  | `passkeyID`, `registeredBy`, `authorizedBy`, label | a passkey registers                         |
| `passkey.revoked`     | `passkeyID`, `revokedBy`                           | a passkey is revoked                        |
| `passkey.used`        | `passkeyID`, `binding`                             | a check passes, in the answer's transaction |
| `passkey_code.issued` | `expiresAt`                                        | `nixie passkey-code` issues a code          |

These records belong to no conversation or task thread, so no client view shows them.
