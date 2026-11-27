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
  `<channel>:<id>` with a channel that a chat feature that is on named. Core names none: the
  composition root fills the list from the features, so a name such as `telegram:51234` reads as a
  host and a port until that feature is on.
- A site's normal form is lower case IDNA ASCII, with no port, no trailing dot and no leading
  `www.`, unless what remains is a public suffix. A mail domain keeps its `www.`. A host or mail
  domain with a backslash, a `?` or a `#` is no place. A name that the public-suffix list does not
  hold, such as `localhost`, is no public suffix.
- A key is one of `site` and `mail_domain` (each with `subdomains`), `address`, `phone`, `handle` or
  `raw`. A `raw` key is a contact that `parsePlace` cannot read, and it matches the exact string. A
  destination that parses to `null` matches only a `raw` key.
- A `site` or `mail_domain` key with `subdomains: true` never names a public suffix, which the
  matcher reads through `tldts` with `allowPrivateDomains: true`. A `mail_domain` entry holds
  `blocked`, `known` or `read`, never `act`, and a site is never `self`.
- When several entries cover a destination, a `blocked` entry wins. Otherwise the most specific
  entry wins: an exact or `raw` key, then the longer domain.
- A rule's `destinations` keep their patterns. Both sides are put in lower case before the match,
  unless the destination parses as a `handle` or as `null`.

## The directory

An entry has an ID from `crypto.randomUUID()`, a short ID the model reads, a key, a level, a name
and an origin: `you`, `proposal`, `card`, `seed` or `nixie_own`. The levels are:

| Level     | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| `blocked` | every call that declares the place is denied                                    |
| `known`   | the place passes stage 5, and the rules decide the call                         |
| `read`    | a call with only reading effects is allowed                                     |
| `act`     | a call with any effect but `spend` is allowed, and each such call is recorded   |
| `self`    | one of your own addresses, numbers or handles; allows like `act` with no record |

The directory writes `places.added`, `places.changed` and `places.removed`, and `places.acted`,
which goes on the call's thread. Each add, change or removal runs the in-force seed in its own write
transaction, which puts a definitions snapshot that holds the directory in force. When the seed
refuses, the whole transaction rolls back and the write is not made. A call decides under the
snapshot it started with, so a block takes effect for each call that starts after the commit. The
seed that adds nixie's own entries runs the in-force seed itself, once all its entries are in.

The `places` projection keeps each entry's IDs, kind, level, sequences and last use. It keeps the
key of a site or mail domain. The key and the name of an address, phone number or handle are
erasable fields of `places.added` and `places.changed`, read back at each call. A removed entry
keeps its row, so a replay of an older call finds its key.

A forget of one record of an address, phone number or handle entry, through `log.forget` or the
conversation's forget, removes the keys of every `places.added` and `places.changed` record of that
entry, and of the marking record when the entry is a contact you marked. No later change of its name
keeps what the forget meant to erase, and the entry covers nothing. `places.removed` and
`places.acted` hold only the entry's ID, which no key opens, because the projection reads the ID of
a removal and a retry reads the ID of an act. These records carry no thread, so the forget accepts
them with any conversation's thread. A call that an `act` place allowed writes its `places.acted`
record once the action queue admits the attempt, and a retry of the call writes none a second time.

- The directory holds at most one entry per key, checked inside the write transaction against the
  keys read back, and contact entries count.
- Contacts you marked read as entries at `known` with no new records: the projection folds the
  contact records, the entry's ID is the contact ID, and the key comes from `parsePlace`. A contact
  that is not an address, phone number or handle, or whose key another entry holds, gets a `raw`
  key. The projection row holds the kind `contact` until `writeContactKinds` sets it to the key's
  kind: a rebuild, a new marking and the start of the server run it. The contact list of the host
  reads every entry at `known`, whoever added it, and the consent check's typed-name match compares
  the canonical form of both addresses.
- The addresses that are you, such as each connected Google account's own, are entries at `self`
  that hold no record. A snapshot lists one entry per live connection by the connection's ID, and a
  call reads the address through the connection's own erasable record. A connection made after a
  snapshot needs a new snapshot, which the end of its consent runs, and forgetting a connection
  takes its address away at once. They share one ID, so a decision never stores an address.
- A feature adds its own addresses, numbers or sites at `act` as `nixie_own` through a source that
  the composition root lists. Before each seed, nixie adds each listed value unless it added that
  value before, so a value you removed stays removed. No feature lists one yet.
- `places.yaml` of [definitions format 7](../core/definitions.md#the-definitions-format) seeds sites
  and mail domains with the origin `seed`. The seed removes only an entry it added and nobody
  changed.
- A key check refuses a raw or public-suffix key, a level the kind cannot hold, and a key that
  another entry holds.
