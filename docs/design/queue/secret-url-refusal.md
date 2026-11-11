# The refusal of a URL that carries a secret

nixie refuses a web fetch of a URL that holds an API key or a token, and the tool error holds the
name of the rule that matched. A model that copies a token into a URL would otherwise send the token
to a site. nixie scans the URL it sends and the URL of every redirect hop, against public secret
rules and against the exact values of its own secrets file. A URL that you typed yourself runs,
unless it holds one of nixie's own values. nixie never shows you a prompt about a refusal.

This doc holds the scan, the exemption, the refusal and the config keys. The scan runs at 2 steps of
[the flow of a page fetch](page-fetch.md): at step 3, before the fetch, on the sent URL, and inside
step 6, the fetch, on each redirect hop. That doc defines the named URL, the sent URL, the hop, the
first pass and the second pass. [The hop gate](secret-url-hops.md) holds how the server scans each
redirect hop.

This doc holds the rules. The files in `sketches/web/` hold the TypeScript shapes and the exact text
of each error, and a "Shape", "Flow", "Usage" or "Text" line points at the section of one. The
[glossary](../../glossary.md) holds the terms that this doc does not define. A rule that ends with
`(open: <name>)` is the intended design and is not settled: [the open list](open/web.md) holds the
item of that name, with its options and its issue. A rule without a mark is settled.

In this doc, "the server" is the nixie server, and "a host" is the host of a URL.

## Built

The code on the main branch does this. Every section after this one is design.

- The web fetch tool is in the connectors module. Its `runPageFetch` hands the URL to `readPage`
  without a scan.
- The fetcher, the program in the fetch sandbox that sends the request, drops a URL's user name,
  password and fragment.
- The tool runner stores a call's input in the call record before the tool runs.
- `startWebFetch` in `apps/server` takes `WebFetchOptions`: the sandbox adapter, the image, the
  denied ranges, the config and the event log. `tool-part-declarations` calls it.
- The skill file reader fetches the files of a skill from a source that the model gives.
  `startWebFetch` gives it a `readPage` of its own, from a second `startFetchSandbox` call. The
  skills module types that function as `ReadPage`, with the URL as its one argument.
- The sessions module imports the connectors module, and the memory module imports the sessions
  module. So the connectors module cannot import the memory module.
- The memory module holds the code that reads your messages. `readOwnerMessages` reads the messages
  of a thread. Each message marks each span of its text as typed or pasted, and
  `collectTypedSegments` returns the typed spans.
- The secrets file holds 6 entries: `deployment_key`, `impd_token`, `definitions_export_token`,
  `model_credentials`, `connector_credentials` and `settings`. The last 3 are maps of strings.
  `secretsSchema` accepts a value of 1 character or more. `settings` holds your name and pronouns.
- The `web_fetch` config section is a strict object, so nixie refuses a config with a key that the
  section's schema lacks.
- A guest, a program that runs in a sandbox, may import a lib, unless the lib carries the
  `server-only` tag.
- gitleaks scans each commit of the repo for secrets, by `.gitleaks.toml`.

## The terms

- **A public rule** is a rule of the pinned public rule set, such as `github-pat`.
- **An own value** is one string of nixie's secrets file that the scan matches exactly. A match
  reports the rule `nixie-secret`.
- **A typed URL** is a named URL that sits in a typed span of one of your messages.
- **The exemption** is a function that decides whether a matched URL runs anyway. nixie builds one
  for each call of the tool.

## The secret scan lib

The lib `@heynixie/secret-scan` holds 2 functions. `findSecret` runs the public rules alone.
`makeSecretFinder` takes the own values and builds a finder, which tries each own value first and
then the public rules. Shape: [the 2 functions and the pin](sketches/web/02-types.ts), section G.
Flow: [the finder](sketches/web/03-flow.ts), section F.

- The public rules are the rules of Betterleaks, an open-source secret scanner, built at a pinned
  commit. (open: betterleaks pin)
- Some rules use a pattern that a backtracking engine runs in more than linear time on hostile
  input. Those rules run on `re2js`, a linear-time engine, which is an entry of the root catalog.
- The lib holds the builder script, the generated rule file with its source and its licence notice,
  and a check that fails when the file and the pinned commit disagree. The rule file is committed,
  so a build of nixie reads no other repo.
- Both functions read the URL as given and in its percent-decoded form.
- A Betterleaks rule can match on the path of the file that it scans. The lib gives each rule no
  file path, so a rule that matches on a file path alone never fires.
- The finder matches each own value as it is and in its percent-encoded form.
- The finder tries the own values first. For a URL that holds an own value and a key that a public
  rule matches, the finder returns `nixie-secret`. The exemption decides by the rule's name, so the
  finder must never return a public rule's name for a URL that holds an own value.
- The lib takes the `server-only` tag, so a guest cannot import the rules.
- The lib is plain functions, with no interface that an adapter fills. Only the rule set changes,
  and the rule set is data.
- A test builds each synthetic key at run time, and `.gitleaks.toml` allows the generated rule file
  by path and by rule.

## The config keys

The `web_fetch` section holds 4 keys for the scan. Shape:
[the keys, their values and their defaults](sketches/web/02-types.ts), section H. Usage:
[the section at its defaults](sketches/web/01-usage.ts), section E.

| Key                          | What it sets                                         | Open item           |
| ---------------------------- | ---------------------------------------------------- | ------------------- |
| `secret_typed_url_covers`    | whether the exemption covers the hops of a typed URL | typed url redirects |
| `secret_own_values`          | which entries of the secrets file hold own values    | own value entries   |
| `secret_own_value_min_chars` | the shortest own value that the scan matches         | own value length    |
| `secret_scan_skill_files`    | whether nixie scans the skill file reader's fetches  | skill file scan     |

- `secret_typed_url_covers` is `redirects`, the default, or `named_url`.
  [The exemption](#the-exemption) holds what each value does.
- `collectOwnValues` reads the entries that `secret_own_values` lists. The default is the 5
  credential entries, which are all but `settings`. With an empty list, the scan matches the public
  rules alone.
- The default omits `settings`, because a match on your name would refuse ordinary URLs, and nixie
  shows no prompt that could let one through.
- `secret_own_value_min_chars` is a whole number of 1 or more, with the default 8. nixie never
  matches a shorter value, because a short value matches by chance.
- `secret_scan_skill_files` is a boolean, with the default true. Under false, the skill file
  reader's fetches run with no scan and no hop gate.
- `apps/server` holds a compile-time check that the names that `secret_own_values` accepts equal the
  keys of `secretsSchema`. An entry added to the secrets file fails the build until the config
  accepts its name.

## What the server wires

`startWebFetch` takes 3 named options, `findSecret`, `isOwnerTyped` and `logger`, and hands each to
the tool and to the skill file reader's `readPage`. The 4 `secret_*` settings arrive in its `config`
option. Shape: [the options](sketches/web/02-types.ts), section I. Usage:
[the wiring and the skill file reader](sketches/web/01-usage.ts), section F.

- The `findSecret` option is a finder that `makeSecretFinder` built, so it matches the own values
  too. `logger` is the server log, which is not the event log.
- `tool-part-declarations` passes the 3 values where it calls `startWebFetch`. A test passes a
  recording `findSecret` through the same option.
- The memory module exports the function that builds `isOwnerTyped`, from `readOwnerMessages` and
  `collectTypedSegments`. The tool takes `isOwnerTyped` as an option, because the connectors module
  cannot import the memory module.
- A URL counts as typed when a typed span of one of the thread's newest 50 messages holds the whole
  URL. A pasted span does not count, and a message that a forget erased does not count. (open: typed
  text)
- The web fetch tool takes a fourth option, `typedURLCovers`, which carries
  `secret_typed_url_covers`.
- For the skill file reader, `startWebFetch` wraps the second `readPage` in a function of the
  `ReadPage` type. The wrapper runs `refuseFetchURL` on the URL, and passes the hop scan to the
  second `readPage`. Its exemption is always false, and its log event is
  `skill_fetch.secret_refused`.

## The exemption

`runPageFetch` builds one exemption for the call, with `makeTypedExemption`. The scan of the sent
URL and the scan of each hop both use it. nixie calls it only after a match, with the rule that
matched. Flow: [the answer order](sketches/web/03-flow.ts), section E.

The exemption returns its answer by this order, and the first line that fits decides:

1. The rule is `nixie-secret`: false, at every hop. This line reads no message. (open: own values
   exemption)
2. Hop 0: the answer of `isOwnerTyped` for the named URL, the URL before any rewrite.
3. A hop after hop 0: the same answer under `redirects`, and false under `named_url`. (open: typed
   url redirects)

What the order gives:

- A URL that you typed word for word runs when it matches a public rule, and nixie logs nothing.
- nixie refuses a typed URL that holds an own value. It starts no sandbox. Nobody means to send one
  of those values to a site.
- Some sites redirect a URL with a token to another host of theirs, such as the `www` host, and put
  the token in the redirect's URL. Under `redirects`, a typed URL of such a site works.
- A fetch with no match reads none of your messages.

## The refusal

`refuseFetchURL` of the connectors module scans a sent URL before its fetch, writes the refusal
sentence and logs the event. The tool and the skill file reader's wrapper both call it.
`makeHopScan` does the same for a hop. Shape: [the 2 functions](sketches/web/02-types.ts), section
F. Text: [the 2 sentences and the 2 log events](sketches/web/02-types.ts), section L.

- nixie returns a refusal as a tool error.
- The scan of step 3 runs before each fetch. In the first pass it scans the sent URL. In the second
  pass the sent URL is the named URL, and it scans that.
- A refusal at step 3, in either pass, ends the call. nixie starts no sandbox and stores no page.
- A refused hop ends the call with the hop's refusal and never sets off the second pass.
- The hop's sentence holds the host that sent the redirect. When the finder matches that host name
  itself, the sentence holds no host. (open: hostless hop sentence)
- The server writes one event to the server log per refusal: `web_fetch.secret_refused` for the
  tool, and `skill_fetch.secret_refused` for the skill file reader. Each holds the rule and the
  hop's number, and nothing else. (open: log event host)
- The error and the log event never repeat the URL or the secret. A log event holds no host name,
  because a forget does not reach the server log.
- The call record holds the refused URL as the model wrote it. That adds no copy that matters: the
  secret sits in the session that the model read it from, and the model's tool call holds the URL
  too. (open: refused url record)
- When a public rule matches an ordinary URL, nixie refuses that page on every call, because it
  shows no prompt. The log event is how you find such a rule.

## What never reaches a sandbox

- For the scan, nixie never sends a value of the secrets file or a rule to a sandbox, in any form. A
  hash of a value is a form of it.
- A page can take over the fetcher. A fetcher that a page took over can follow a redirect and never
  ask the server, in the same way that it can skip its own check of the denied address ranges. Such
  a fetcher holds no own value and no rule.
- A site can redirect to a URL that holds its guess of an own value, and see whether the request for
  that hop comes. Each fetch gives the site one yes or no about a whole value. The default of 8 for
  `secret_own_value_min_chars` is what makes such a guess hard.

## Not in scope

- A scan of page content or tool results.
- The outbound URL check of every tool.
- A change to what the call record or a turn-input log stores of a refused URL.
- The headless browser reader: [the hop gate](secret-url-hops.md) lists what it reuses.
- The rules inside the fetcher, a sandbox for each hop, and a hash or a filter of the own values in
  the sandbox. Each breaks a rule of [What never reaches a sandbox](#what-never-reaches-a-sandbox)
  or of the hop gate.
