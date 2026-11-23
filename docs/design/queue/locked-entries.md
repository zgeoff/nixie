# Locked entries

- **Status:** draft
- **Work items:** [locked vault entries](https://linear.app/zgeoff/issue/GEO-2814). It builds on
  [accounts and sign-in](accounts.md), which lands first.

You can lock a [vault](accounts.md#the-vault) entry. nixie then holds its secret sealed under a key
that only your passkey opens, so each use waits for your tap, whatever the rules say. The label,
group, username and origins stay readable, so lists and approval cards still show the entry.

## Contracts

```ts
// connectors module; the key store holds a locked entry's secret key only in wrapped form
interface LockedKey {
  entryID: string;
  credentialID: string; // the passkey whose PRF output wraps this copy
  salt: string; // random per entry and passkey; the PRF input, so each entry's wrapping key differs
  wrapped: SealedValue; // the secret key under a key derived from that PRF output
}

// contract lib: prf is the PRF output of the same WebAuthn assertion that answers the request, from
// a device session. The assertion's challenge binds the request hash as every passkey answer does,
// and the server takes a prf only beside an assertion it verified for that exact request.
type PRFUnlock = { credentialID: string; output: string };

// the approval of a held call on a locked entry carries the unlock
proposals.approve({ proposal, actionHash, attempt, assertion, prf });
// the server checks the assertion against the proposal's action hash and attempt number,
// prf.credentialID against the assertion's own credential and the entry's LockedKey, and the
// entry's version against the one the card showed; it unwraps the secret key in memory for that one
// attempt, and drops the key and the PRF output when the attempt ends

vault.lock({ account, prf }); // new secret key, sealed again, wrapped under prf's passkey; the old
//   key is destroyed. Refuses NO_PRF when the assertion returned no PRF output
vault.addLockPasskey({ account, prf, newPRF }); // two assertions in one request: prf from a passkey
//   that holds a copy, newPRF from the one to add; nothing changes unless both verify
vault.unlock({ account, prf }); // a new secret key that the key store holds unwrapped again
vault.reveal({ account, prf }); // prf only for a locked entry
```

## Constraints

- A locked entry has two keys: a label key, which stays in the key store so lists and cards read the
  label, group, username and origins, and a secret key, which the key store holds only wrapped.
- Every call that reads a locked entry's secret asks with the passkey, whatever the rules say:
  `sign_in`, `rotate`, `wallet.pay` and `vault.reveal`. Its card offers no "always allow", and no
  lift passes a `wallet.pay` on a locked card. A decision of allow on a locked entry still asks.
- The vault reads a locked secret only inside an action whose approval carried a `prf` that the
  server verified for that action. It refuses a `prf` whose credential holds no copy for the entry,
  or whose assertion answers another proposal.
- The unwrapped key and the PRF output live in memory for one attempt of one action. The server
  drops both when the attempt ends, on success, refusal, timeout or cancel, and when the action ends
  before its attempt starts. A retry, an answer to an unknown outcome, a restart and a task that
  pauses before its attempt each ask for the passkey again, and the queue holds the retry until you
  answer from a device. The web client drops the PRF output once the request returns. Nothing writes
  either to disk or to a log.
- `vault.lock` makes a new secret key, seals the secret again under it, wraps it, and destroys the
  old key, so a backup of the key store from before the lock can't open the secret sealed after it.
  `vault.unlock` makes a new secret key the same way.
- A backup from before the lock still holds the old key and the old sealed secret, as a backup from
  before a forget does. The vault screen shows the lock's backup state the way
  [a forget's backup state](../../architecture/deployment/backups.md#a-forgets-backup-state) shows,
  and the lock is whole only once that state is complete.
- `vault.lock` wraps the secret under only the passkey that answered it. Add another passkey with
  `vault.addLockPasskey`, and give each copy that passkey's own PRF output.
- Revoking a passkey removes its copies, and refuses while it holds the last copy of a locked entry,
  from a device and from the server's command line alike. Unlock or forget that entry first.
- The redaction pass and the proxy's URL scan look for each unlocked secret and each locked secret
  that an attempt holds open. They can't look for a locked secret outside an attempt, because the
  server can't read it.
- The `LockedKey` rows live in the key store, so a forget destroys them with the entry's other keys,
  and the key store's purge of older copies covers them as it covers any key.
- A forget of an entry that an action holds open ends that action before the forget completes, and
  the action drops its unwrapped key.
- While an action holds a locked secret, the server replaces it with dots in that action's results
  and in any page the action stores. Once the action drops the key, nixie holds no copy of the
  secret to look for, so a page stored later that echoes it goes unredacted, as
  [accounts](accounts.md#decisions) accepts for an echo that changes the secret's form.

## Decisions

- **A locked entry stays sealed until you open it.** A rule decides whether nixie may use an entry
  it can read. Only your passkey opens a locked entry, so a wrong rule, a bug in the decision point
  or a tricked assistant still gets nothing. It costs a tap per use, so you lock only what deserves
  it.

## Builder decides

- The key derivation from the PRF output, and the wrapping cipher.
- Where the lock control sits on the vault's screen.

## Open questions

- **Does your passkey return a PRF output?** Locked entries need the WebAuthn PRF extension in the
  passkey provider and the browser. Your first lock of a throwaway entry settles it. Until then,
  `vault.lock` refuses with `NO_PRF`, and every other part of the vault works.
