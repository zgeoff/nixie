# Places

nixie keeps one directory of the places it deals with: websites, email addresses, mail domains,
phone numbers and chat handles. Each entry carries one trust level, and the
[decision point](decision-point.md#destinations) reads the level of every destination a call
declares. `modules/policy` owns the matcher, the directory and its records.

## The matcher

Compare a destination with an entry only through `parsePlace` and `isPlaceCovered`, never as raw
strings. Neither does I/O.

```ts
parsePlace('https://Docs.Example.org:8443/a?b=1'); // { kind: 'site', domain: 'docs.example.org' }
parsePlace('https://www.example.org/'); // { kind: 'site', domain: 'example.org' }
parsePlace('Sam@Example.org'); // { kind: 'address', address: 'sam@example.org' }
parsePlace('+61 420 000 000'); // { kind: 'phone', e164: '+61420000000' }
parsePlace('telegram:51234'); // a handle while the telegram feature is on, else a host and a port
parsePlace('0420 000 000'); // null: a phone number needs its country code
parsePlace('not a place'); // null

parsePlacePattern('*.library.example.org'); // { kind: 'site', domain: 'library.example.org', subdomains: true }
parsePlacePattern('@example.org'); // { kind: 'mail_domain', domain: 'example.org', subdomains: false }
parsePlacePattern('*.github.io'); // null: the key would cover a whole public suffix
```

- `parsePlace` tries a URL with `://`, an address, a phone number, a handle, then a host with an
  optional port. A phone number parses only from `+` and its digits. A handle parses only as
  `<channel>:<id>`, with a channel from the list of chat features that are on. Core lists none: the
  composition root fills the list from the features, so `telegram:51234` reads as a host and a port
  until the telegram feature is on.
- A site's normal form is lower case IDNA ASCII, with no port, no trailing dot and no leading
  `www.`, unless what remains is a public suffix. A mail domain keeps its `www.`. A host or mail
  domain with a backslash, a `?` or a `#` is no place. A name that the public-suffix list does not
  hold, such as `localhost`, is no public suffix.
- A key is one of `site` and `mail_domain` (each with `subdomains`), `address`, `phone`, `handle` or
  `raw`. A `raw` key is a contact's exact text, kept when `parsePlace` cannot read it or another
  entry holds its key, and it matches the exact string. A destination that parses to `null` matches
  only a `raw` key.
- A `site` or `mail_domain` key with `subdomains: true` never names a public suffix. The matcher
  reads the public-suffix list through `tldts` with `allowPrivateDomains: true`. A `mail_domain`
  entry holds `blocked`, `known` or `read`, never `act`, and a site is never `self`.
- When several entries cover a destination, a `blocked` entry wins. Otherwise the most specific
  entry wins: an exact or `raw` key, then the longer domain, then the higher level. A contact you
  marked at one of your own addresses therefore leaves that address at `self`.
- A rule's `destinations` keep their patterns. Both sides are put in lower case before the match,
  unless the destination parses as a `handle` or as `null`.

## The directory

An entry has an ID from `crypto.randomUUID()`, a short ID the model reads, a key, a level, a name
and an origin: `you`, `proposal`, `card`, `seed` or `nixie_own`. The levels are:

| Level     | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| `blocked` | every call that declares the place is denied                                    |
| `known`   | the place passes [stage 5](decision-point.md#the-stages), and the rules decide  |
| `read`    | a call with only reading effects is allowed                                     |
| `act`     | a call with any effect but `spend` is allowed, and each such call is recorded   |
| `self`    | one of your own addresses, numbers or handles; allows like `act` with no record |

The directory writes `places.added`, `places.changed` and `places.removed`, and `places.acted`,
which goes on the call's thread. Each add, change or removal that the user or a tool makes runs the
in-force seed in its own write transaction, which puts a definitions snapshot that holds the
directory in force. The definitions seed writes the entries of `places.yaml` inside its own
snapshot, and the seed of nixie's own entries runs the in-force seed once after its entries, when it
added any. When the seed refuses, the whole transaction rolls back. A call decides under the
snapshot it started with, so a block takes effect for each call that starts after the commit. The
snapshot lists each entry's level and the record its name came from, so a rename leaves an older
snapshot's name of an address, phone number, handle or contact as it was.

The `places` projection keeps each entry's IDs, kind, level, sequences and last use. A call uses an
entry when its `tool_called` decision carries the entry's permission, whatever the outcome. The
projection keeps the key of a site or mail domain, and a removal or an act of one holds the entry's
IDs in its payload. An address, phone number or handle keeps its key and name in the erasable fields
of `places.added` and `places.changed`, as a contact keeps a new name. A `places.removed` or
`places.acted` record of an address, phone number or handle holds the entry's IDs in its own
erasable fields. A fold cannot read erasable fields, so no projection row holds a value that only an
erasable field gives. A rebuild gives back the rows of the live log. The writer of an address, phone
number or handle removal records it in `place_removals`, a table outside the projections, and a
rebuild and each server start read the removals back. A removed entry keeps its row, so a replay of
an older call finds its key.

A call that an `act` place allowed writes its `places.acted` record on the call's thread once the
action queue admits the attempt, and a retry of the call reads the act records back and writes none
a second time.

A forget of one record of an address, phone number or handle entry, through
[`log.forget`](../channels/api.md#forgetting-a-record) or the conversation's forget, removes the key
of every record of that entry: its `places.added`, `places.changed`, `places.removed` and
`places.acted` records, and the marking record when the entry is a contact you marked. Any of those
records is a forget target. `places.added`, `places.changed`, `places.removed` and the marking
record carry no thread, so the forget accepts them with any conversation's thread, and
`places.acted` takes its call's thread.

The forget's start record keeps the key of each record it found while the entry was readable. The
cleanup reads the entry's records again, which finds an act written since the start, and removes the
target's own key last, so a retry after a crash removes them all. The entry then covers nothing, and
no readable record holds its IDs. A record of a site or mail domain is no forget target, because its
key and IDs sit in the payload, where no key can erase them.

- The directory holds at most one entry per key, checked inside the write transaction against the
  keys read back, and contact entries count.
- Each contact you marked reads as an entry at `known`, with no new records. The projection folds
  the contact records, the entry's ID is the contact ID, and the key comes from `parsePlace`. A
  contact that is not an address, phone number or handle, or whose key another entry holds, gets a
  `raw` key. The projection row keeps the kind `contact`, and the directory reads its key from the
  marking record each time. The host's contact list reads every entry at `known`, whoever added it,
  and the consent check's typed-name match compares the canonical form of both addresses.
- The addresses that are you, such as each connected Google account's own, are entries at `self`
  that hold no record. The [connections module](../connectors/google-connections.md) keeps each
  address of a connection under a reference of its own, sealed under the connection's key, and never
  changes it. A snapshot lists the reference of each live connection's newest address, and a call
  reads the address kept under its own snapshot's reference. A renewal that reaches a new address
  keeps a new reference, so a call under an older snapshot still sees only the older address. A
  connection made or moved after a snapshot needs a new snapshot, which the end of its consent runs,
  and forgetting a connection takes every address away at once. Each `self` entry's ID is its
  address's reference, so a decision never stores an address.
- A feature adds its own addresses, numbers or sites at `act` as `nixie_own` through a source that
  the composition root lists. After each seed of the definitions, nixie adds each listed value
  unless it added that value before, so a value you removed stays removed. The phone lists its
  configured number, and `parsePlace` reads each destination of `phone.send` as a phone place.
- `places.yaml` of [definitions format 7](../core/definitions.md#the-definitions-format) seeds sites
  and mail domains with the origin `seed`. The seed replaces an entry it added when the file changes
  its level or its name, and removes only an entry it added and nobody changed.
- A key check of an entry that the user, a tool or a seed adds refuses a raw or public-suffix key, a
  level the kind cannot hold, and a key that another entry holds. A contact's `raw` key comes from
  its marking and meets no key check.
