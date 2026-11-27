# The wallet

- **Status:** agreed
- **Decision records:** [0057](../../decisions/0057-every-optional-feature-has-a-switch.md)
- **Work items:** [the wallet](https://linear.app/zgeoff/issue/GEO-2757). It builds on
  [accounts and sign-in](accounts.md), which lands first.

The assistant pays with cards that sit in the same vault as its passwords. It fills a card into a
checkout the way it fills a password, so the card's number never reaches the model. A purchase is a
`spend` action under the [budgets](../../architecture/policy/budgets.md) rules. A small purchase
goes through without asking only under a lift, and only when the total on the page matches the
amount the assistant declared. Every other purchase asks the user. Each card has a monthly budget of
its own and lifts of its own, so the assistant's card can lift small purchases while another card
asks every time. A rule can also name a card's [group](accounts.md#the-vault) to ask or deny. The
wallet is an optional feature: with no `wallet` section in the deployment config, nixie offers none
of its tools.

## Shape

```mermaid
flowchart LR
  model[assistant] -->|"wallet.pay"| tool[tool reads origin and page total]
  tool --> point[decision point]
  point -->|"lift or the user's approval"| queue[action queue]
  queue --> broker[sign-in broker]
  broker -->|"read card"| vault[(vault)]
  broker -->|"fill frame"| guest[browser guest]
  guest -->|"fill, recheck total, submit"| page[checkout]
  queue --> record[(purchase.recorded)]
```

## Contracts

### The tools

```ts
wallet.pay({
  tab: 't1',
  amount: { value: '8.00', currency: 'EUR' }, // a decimal string, in the page's own currency
  item: 'one font licence',
  card: 'c3w8p1z6mt', // needed when the vault holds more than one card
  submit: 'E12',
  repeats: 'monthly', // optional: 'monthly' | 'yearly', for a subscription
});
// → { status: 'paid', purchase: 'pq3z8w1n5v', merchant: 'fonts.example.com',
//     pageTotal: '8.00 EUR', charged: '8.98 USD', cardCharge: 'about 13.85 AUD' }
//   charged: 8.00 EUR at the day's rate of 1.09 USD, plus the 3% margin. A page in USD gets no
//   margin, and its charged equals its amount.
//   The guest fills the card and reads the total again. It clicks submit only while the total
//   still equals the expectTotal the approval bound, as Spending below says.
//   A bank check that shows after the submit makes the guest wait up to 5 minutes for the page to
//   leave the check, which the user approves in the bank's app. When it leaves, the call returns
//   'paid' only when the page after it holds no card field and no check; any other page returns
//   { status: 'unknown', purchase } with the reason 'bank_check_unclear'. When the page doesn't
//   leave the check, the reply is bankCheck: 'timeout', and the call returns the same unknown
//   outcome with the reason 'bank_check_timeout'. The user settles each.

wallet.read({});
// → { cards: [{ card: 'c3w8p1z6mt', label: 'wallet', group: 'nix', isLocked: false,
//              month: { liftBudget: '65.00 USD', liftSpent: '24.40 USD', left: '40.60 USD',
//                       approvedSpent: '26.00 USD' } }],
//     lifts: [{ card: 'c3w8p1z6mt', merchants: ['fonts.example.com'], perAction: '16.00 USD' }],
//     purchases: [{ purchase: 'pq3z8w1n5v', at, merchant: 'fonts.example.com', amount: '8.00 EUR',
//                   charged: '8.98 USD', item: 'one font licence', approval: 'owner', repeats: 'monthly' }],
//     subscriptions: [{ purchase: 'pq3z8w1n5v', merchant, item, repeats: 'monthly', charged: '8.98 USD' }],
//     next: null }
//   liftSpent counts lifted purchases, which the budget caps; approvedSpent counts the ones the
//   user approved. subscriptions lists each repeating purchase until wallet.cancel marks it.
//   An item the user forgot reads '[forgotten]'. The tool call's own record keeps the result
//   without the items, in the record form the tool calls doc sets for copied erasable text, so a
//   forget of the purchase leaves no copy of its item.

wallet.cancel({ purchase: 'pq3z8w1n5v' }); // after the assistant cancels it on the merchant's site
// → { purchase: 'pq3z8w1n5v', cancelledAt }
```

`wallet.pay` refuses as [`account.sign_in`](accounts.md#the-tools) does, with these as well:

| Refusal            | When                                                         |
| ------------------ | ------------------------------------------------------------ |
| `WHICH_CARD`       | the vault holds several cards and the call names none        |
| `NO_RATE`          | no exchange rate exists for the page's currency              |
| `NO_CARD_FIELD`    | the guest finds no card field it may fill; carries `report`  |
| `TOTAL_CHANGED`    | the total changed after the fill, so the guest never clicked |
| `UNKNOWN_PURCHASE` | `wallet.cancel`: no purchase has that ID                     |
| `NOT_REPEATING`    | `wallet.cancel`: the purchase doesn't repeat                 |

`WHICH_CARD` and `NO_RATE` return from the prepare hook before the decision, so no approval card
shows.

```ts
// wallet module: the effects each tool declares
// wallet.read, wallet.cancel: ['note'], direct. wallet.cancel marks nixie's record only.
// wallet.pay: ['spend'], queued; destination: the tab's site place; amount: charged, below.
// The prepare hook reads the tab's origin, its URL and the checkout's total from the guest, and
// puts the card entry's version and the observed total inside the hashed call. It also sets the
// prepared call's canLift, a field core reads for any spend: false when the page total is missing
// or differs from the declared amount, the card is locked, or the call repeats.
```

The approval card for a purchase shows the card's short ID, label and group, the merchant, the
declared amount, the total the guest read from the page or "no total found", `charged` in USD with
the card's currency beside it, and whether it repeats. A total that differs from the declared amount
shows both, marked as differing. An entry that changed since the proposal fails the answer as
`CONFLICT`, and the attempt as `ENTRY_CHANGED`.

```yaml
# deployment config. Absent: the wallet is off. It requires the vault and the computer.
wallet:
  conversion_margin: 0.03
```

### The card in the vault

```ts
// wallet module; fields a card entry adds to VaultEntry
interface VaultEntry {
  // …the fields that accounts.md#the-vault defines
  fingerprint: string | null; // an HMAC of the number under a server key; the only form in records
  frameOrigins: string[]; // the payment frames the user allows, such as https://js.pay.example; else []
  currency: string | null; // the ISO code the card bills in, shown beside USD figures
  budget: string; // the name of the card's own spend budget in the ledger: `card-<account>`
}
vault.add({
  kind: 'card',
  label: 'wallet',
  currency: 'AUD',
  secret: { number, expiry, code },
  frameOrigins: [],
  group: 'nix',
  monthlyBudget: '65.00', // USD; sets the card's spend budget
}); // → { account: 'c3w8p1z6mt' }
// vault.update of a card takes monthlyBudget too. Both write wallet.budget_set with the card's
// budget ID and its limit, a vault_write check the passkey window covers. No definitions file sets
// a card budget: the budget parser refuses a file whose ID starts with card-, so the wallet is the
// one source of each card-<account> budget.
// The wallet part adds the card kind and these fields to the vault's list of entry kinds. While
// the wallet is off, the vault keeps card entries as stored, as the switch rule keeps a feature's
// records, lists each by its kind and label, and refuses every other card call with FEATURE_OFF.
// vault.reveal of a card → { number, expiry, code }; it always asks for a passkey tap, from a
// signed-in client's full session only
```

### The fill frame for a card

```ts
// wire lib: the card's additions to the frame in accounts.md#the-fill-frame
type TotalRequest = { op: 'total'; tab: string }; // → { ok: true; pageTotal: string | null } | tab_gone
// FillRole gains 'card_number' | 'card_expiry' | 'card_code'
// FillRequest gains frameOrigins: string[], the card's allowed payment frames
// FillRequest.submit gains expectTotal: string | null: the total the approval bound; null only when
//   the prepare hook found none, and then the guest clicks with no total check
// FillReply ok gains pageTotal: string | null and bankCheck: 'none' | 'passed' | 'timeout' (a
//   bank's check frame showed after the submit, and the page left it or didn't within 5 minutes);
//   its reasons gain 'total_changed'
```

### The purchase record

```text
purchase.submitting            -- wallet module, written before the guest is asked to submit
  action_id      text
  attempt        integer
  purchase       text          -- the short ID purchase.recorded will carry
purchase.recorded              -- wallet module, one per wallet.pay that clicks submit
  purchase       text          -- short ID
  action_id      text          -- with attempt, ties the record to its submitting record
  attempt        integer
  amount         integer       -- micros of the page's currency, the amount the assistant declared
  currency       text          -- the page's currency
  page_total     integer null  -- micros of the page's currency, the total the guest read; null when none
  charged        integer       -- USD micros, the amount the budget counts
  rate           text null     -- the exchange rate and its date; null when the page is in USD
  merchant       text          -- the site place the card was filled on
  item           text          -- erasable
  approval       text          -- 'lift' or the approval's ID; wallet.read shows an ID as 'owner'
  card           text          -- the card entry's fingerprint
  repeats        text null     -- 'monthly' | 'yearly'
purchase.cancelled             -- wallet module, one per wallet.cancel
  purchase       text
```

## Constraints

The card on the page:

- A card part goes only into a field whose `autocomplete` names that part, in a frame whose own
  origin is the merchant's or one of the card's `frameOrigins`.
- A tab holds a filled card field from the fill until the page navigates after the submit, the guest
  finds no card field that still holds a value, the guest clears the fields after a refusal, or the
  tab closes. The guest keeps which tabs hold one.
- A card number shows in full in a picture, so while a tab holds a filled card field, every computer
  tool that returns a picture of it returns `FILLED_TAB` instead: `browser_screenshot` and
  `browser_scroll` on the tab, and `screenshot`, `screen_scroll` and any screen act while a window
  shows it, whichever window the act aims at. `browser_click`, `browser_fill`, `browser_download`,
  `screen_click` and `screen_type` return `FILLED_TAB` on that tab too, so only `wallet.pay` submits
  a payment.
- `wallet.pay`, `account.sign_in`, `account.sign_up` and `account.rotate` act on the desktop, so the
  wallet and vault parts add them to the core take-over guard's list. While you hold the desktop,
  they wait, as `computer.*` actions do.
- Before each screen act, the screen tool asks the browser guest, in the same computer sandbox,
  which windows show a tab that holds a filled card.
- The message of `FILLED_TAB` says the tab holds a filled card, that screenshots and clicks are off
  until `wallet.pay` submits or the tab closes, and that `computer.browser_read` still reads the
  page. The descriptions of the computer tools say the same.
- A card fill that fails writes the `account.fill_failed` record and the page dump that
  [a password fill](accounts.md#constraints) writes, with no screenshot.

Spending:

- Before the decision, the guest reads the checkout's total from the page. The guest reads the
  currency from an ISO code on the page or a symbol only one currency uses. A total in a symbol
  several currencies share, such as `$` alone, counts as no total found.
- The total matches when it equals the declared amount to the currency's minor unit. Stage 4 of
  [budgets](../../architecture/policy/budgets.md) gains one generic check: a lift passes only a
  prepared call whose `canLift` is true. A spend from another feature sets `canLift` by its own
  rule, and core never names the wallet.
- An approval binds the total the guest observed. The guest then clicks only while the page still
  shows that total, whether it matched the declared amount or the user approved a difference. With
  no total found, the approval binds none, and the guest clicks with no total check.
- Every budget figure is in USD micros, as the budgets ledger counts. When the page's currency is
  not USD, the server converts the amount to USD at the day's reference rate and adds
  `conversion_margin` for the bank's conversion fee. That `charged` amount is what a lift and the
  budget check. The card's own currency shows only as an approximate figure beside it.
- The rate source is the core `RateSource`, which the wallet and the spend feature share. It reads a
  rate between any two currencies and keeps the rate's date, and its one adapter is
  `rates-frankfurter`, which needs no key.
- Each card has its own spend budget, `card-<account>`, in the budgets ledger. The core keeps a list
  of budgets that features fill, and the wallet fills it with one budget per card, so the rule
  parser accepts a lift that names a card's budget, as it accepts a budget a file defines. A rule
  that names a card's budget before the card exists is refused when it is proposed. A rule whose
  card the user forgot lifts nothing.
- A lifting rule for `wallet.pay` names one card's budget, and its destinations are site places.
- The prepare hook resolves the card before the decision, from the call's `card` or the vault's one
  card, so the rule match and the ledger charge use the same card.
- A `wallet.pay` passes without asking only under a lifting rule whose budget is the card's, whose
  destinations include the merchant's site place and whose `perAction` covers `charged`, with
  `canLift` true, while the card's budget covers `charged`. The ledger reserves the charge as it
  does for every lift, so two purchases at the card's last room can't both pass. Every other
  `wallet.pay` asks the user.
- A one-off purchase approval on an unlocked card is a passkey check that the 10-minute passkey
  window covers. A purchase on a locked card takes a fresh tap, as every locked call does. A
  `wallet.pay` with `repeats` always asks for a fresh passkey tap, and its approval card says it
  repeats.
- Adding a card makes its budget and no lift, so a new card never widens what another card's rule
  allows.
- A repeating purchase counts once, when it's made. nixie never sees a later charge.
- A lift charges the budget when the action queues, as
  [budgets](../../architecture/policy/budgets.md#lifts) says. A purchase the user approved never
  counts against the budget. A `wallet.pay` that ends before its click credits the charge, and the
  guest clears the card fields it filled.
- The action writes `purchase.submitting` before it asks the guest to submit. After a crash, an
  attempt with that record is an unknown outcome, and one without it credits the charge.
- Every `wallet.pay` that clicks submit writes a `purchase.recorded` record. After a crash, the
  answers `happened` and `drop` both write it from the `purchase.submitting` record, with the page
  total unknown, because the click may have happened. Only `didnt_happen` writes none.
- A new card starts with a monthly budget of 65 USD and no lifting rule, so it lifts nothing until
  the user adds one.
- This build changes `answerUnknownOutcome` and budgets.md for `spend` actions:
  - a new choice, `didnt_happen`, credits the charge;
  - `happened` and `drop` keep the charge, because money may have left, where the built `drop`
    credits;
  - `retry` is refused for a `wallet.pay` whose attempt wrote `purchase.submitting`, because the
    checkout may already have taken the money.
- The card's own limit in the bank's app is the hard cap.
- `wallet.read` shows the assistant its own cards' budget figures. That is an exception to the
  metering rule that the assistant never sees dollar figures, and it covers the wallet's own cards
  only.
- `purchase.recorded` declares `item` in `ErasableRecordKinds`, the server record-kind map and one
  descriptor list. Forgetting it leaves the amounts, which the budget needs.
- A repeating purchase and a purchase on a locked card join the approvals core list of fresh-tap
  checks, which [locked entries](locked-entries.md#contracts) defines.
- The wallet is the `wallet` feature, in its own `modules/wallet` package. It names
  `requires: ['vault', 'computer']`, and no core module names a card, a purchase or the wallet.

## Decisions

- **The page's total gates the lift.** The model's declared amount alone can be talked down, so a
  lift passes only when the page agrees with it.
- **A merchant can charge more than nixie recorded.** A checkout can show one total and charge
  another once it has the card, and a merchant that saved the card can charge it later. nixie sees
  neither. The bank's limit caps both, and the purchase records let the user spot them in the bank's
  app.

## Builder decides

- How the guest finds the card fields and the checkout's total, within the rules above.
- The tools' descriptions and the refusal wording.

## Out of scope

- Reading a card statement from the bank. The card has no API.

## Open questions

- **Does the bank ask for a 3-D Secure check on each purchase?** Settle it with a test purchase once
  the user has the card. Until then, `wallet.pay` waits up to 5 minutes for a bank check.
