# Locked entries

- **Status:** agreed
- **Decision records:** [0057](../../decisions/0057-every-optional-feature-has-a-switch.md)
- **Work items:** [locked vault entries](https://linear.app/zgeoff/issue/GEO-2814). It builds on
  [accounts and sign-in](accounts.md), which lands first.

You can lock a [vault](accounts.md#the-vault) entry. nixie then holds its secret sealed under a key
that only your passkey opens, so each use waits for a fresh tap, whatever the rules say. The label,
group, username and origins stay readable, so lists and approval cards still show the entry. Locked
entries are part of the `vault` feature, and need no config of their own.

## Contracts

```ts
// vault module; the locked_wrappers table, beside the key store's other wrappers
interface LockedWrapper {
  entryID: string;
  credentialID: string; // the passkey whose PRF output wraps this copy
  salt: string; // random per entry; the PRF input, so each entry's wrapping key differs
  wrapped: SealedValue; // the secret key under a key derived from that PRF output
}

// contract lib: prf is the PRF output of the same WebAuthn assertion that answers the request, from
// a signed-in client's full session. The assertion's challenge is of the new locked_answer kind,
// which joins alwaysAskKinds, so the passkey window never covers it and every call taps.
type PRFUnlock = { credentialID: string; output: string };

// approvals: prf rides as an opaque feature payload, which core passes to the vault part unread
approvals.answerProposal({ proposalID, actionHash, choice, clientActionID, passkey, prf });
approvals.answerUnknownOutcome({ proposalID, choice, passkey, prf }); // prf for a retry
// the vault checks prf.credentialID against the assertion's own credential and the entry's
// wrapper, and the entry's version inside the hashed call; it unwraps the secret key in memory for
// the next attempt, and drops the key and the PRF output when that attempt ends

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
- Every call that reads a locked entry's secret is an `always_ask` row: `sign_in`, `rotate`,
  `wallet.pay` and `vault.reveal`. Its card offers no "always allow", no lift passes a `wallet.pay`
  on a locked card, and a decision of allow still asks.
- An answer to many proposals at once never approves a call on a locked entry. Each takes its own
  tap.
- The vault reads a locked secret only inside an action whose answer carried a `prf` that the server
  verified for that action. It refuses a `prf` whose credential holds no copy for the entry, or
  whose assertion answers another proposal.
- The unwrapped key and the PRF output live in memory for one attempt of one action. The server
  drops both when the attempt ends, on success, refusal, timeout or cancel, and when the action ends
  before its attempt starts. Nothing writes either to disk or to a log. The web client drops the PRF
  output once the request returns.
- A retry, a restart and a task that pauses before its attempt each need a fresh tap. The queue
  holds such an attempt in a hold of its own until you answer it with a `prf`.
- `vault.lock` makes a new secret key, seals the secret again under it, wraps it, and destroys the
  old key, so a backup of the key store from before the lock can't open the secret sealed after it.
  `vault.unlock` makes a new secret key the same way.
- A lock, an unlock and every wrapper removal make a backup due. The vault screen shows the lock's
  backup state as it shows
  [a forget's backup state](../../architecture/deployment/backups.md#a-forgets-backup-state). The
  lock is whole only once that state is complete.
- `vault.lock` wraps the secret under only the passkey that answered it. Add another passkey with
  `vault.addLockPasskey`, and give each copy that passkey's own PRF output.
- Revoking a passkey removes its copies. The vault fills the core list of revoke guards, so a revoke
  refuses while the passkey holds the last copy of a locked entry, from a client and from the
  server's command line alike. Unlock or forget that entry first.
- The redaction pass and the proxy's URL scan look for each unlocked secret and each locked secret
  that an attempt holds open. They can't look for a locked secret outside an attempt, because the
  server can't read it.
- A forget of an entry destroys its wrappers with its other keys, and ends every open attempt on it
  before the forget completes.
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
  passkey provider and the browser. Lock one throwaway entry once this lands to find out. Until
  then, and on a passkey without PRF, `vault.lock` refuses with `NO_PRF`, and every other part of
  the vault works.
