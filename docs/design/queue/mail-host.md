# The assistant's mail host

- **Status:** agreed
- **Work items:** [the assistant's own mailbox](https://linear.app/zgeoff/issue/GEO-2816)

The assistant's mailbox, its `mail.*` tools, its wake rules and its arrival path are built, as
[the assistant's mailbox](../../architecture/core/mailbox.md) describes. No real mail host exists
yet, so a release build with a `mail` config section refuses to start. Build the host: one adapter
that implements `MailHost` against a real mail system, and choose the assistant's own domain.
[Accounts and sign-in](accounts.md) waits on it, because each account takes the mailbox as its
username.

## Contracts

```ts
// Adapter: mailhost-<system>, named once the host is chosen. It implements MailHost from the mail
// module and reaches the host only through the credential store, never with a credential's value.
const host = buildMailHost({ credentials, address }); // address: the `mail.address` config value
```

- The adapter reaches the host through the credential store's `fetcher` or `socket`, under the
  connector credential `deployment:mail`. See the
  [credential store](../../architecture/connectors/credentials.md) for both calls.
- A send sets the Message-ID `<actionID>@<the assistant's domain>`, and `findSent` reconciles an
  unknown outcome by that header. The Message-ID carries no other mark of nixie.
- `watch` is optional. The adapter implements it only when the host pushes a hint.
- The adapter keeps its cursor opaque. `readChanges` answers `resynced` with every mail when the
  host no longer knows the cursor, and `failed` with the host's retry time when the host names one.

## Constraints

- A release build starts the adapter when the config holds a `mail` section.
- The adapter never deletes mail at the host, and serves one address.
- The adapter passes the same contract tests as the host in memory.

## Builder decides

- The host calls the adapter makes, and how it pages `readChanges`.
- Whether the host's push hint backs `watch`.

## Out of scope

- Mail on a second address, and deleting mail at the host.

## Open questions

- **Which mail host, and which domain?** The owner picks both. Until then, a test build serves the
  host in memory and a release build has no mailbox.
