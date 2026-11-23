# The secret scan

The secret scan finds an API key or a token inside a URL, so the web fetch tool never sends one to a
site. `libs/secret-scan` holds the scan and nothing else: it takes a URL and returns the name of the
rule that matched, or null. [Web fetch](./web-fetch.md#the-secret-scan) covers where the scan runs,
what a refusal says and when a URL is exempt. The lib is tagged `server-only`, because its own
values are the server's secrets and its rule file has no use in a guest or a client.

```ts
findSecret('https://api.example.com/v1/items?token=<a GitHub token>'); // { rule: 'github-pat' }
makeSecretFinder(['<a deployment key>'])('https://x.example/?k=<that key>'); // { rule: 'nixie-secret' }
```

`findSecret` tries the public rules alone. `makeSecretFinder` takes the own values, which are the
exact strings of nixie's secrets file, and tries each one before the public rules. A URL that holds
an own value and a public key therefore reports `nixie-secret`, so a reader of the server log can
tell a leak of nixie's own credential from a match of a public rule. A match returns the rule's name
and nothing else.

## The public rules

The public rules are the Betterleaks rules at tag v1.9.0, commit `81aff7a`, from its
`config/betterleaks.toml`, under the MIT licence. The lib commits a generated rule file, so a build
reads no other repo. The file's header holds the source, the commit, the licence notice and the list
of every clause the builder could not keep. `bun run --cwd libs/secret-scan rules:build` writes the
file from the pinned source, and `rules:check` fails when the file and the pinned commit disagree.
`.gitleaks.toml` allows the generated file by path and by rule, because the patterns of some public
rules match their own text.

Every rule runs on `re2js`, so each scan runs in time linear in the URL's length, whatever a hostile
site puts in a redirect.

## The URL forms

A rule matches when it matches any of 3 forms of the URL:

1. the URL as given;
2. the URL percent-decoded;
3. the URL with each `&`, `?`, `#` and `/` replaced by a line break, and then each line
   percent-decoded.

The third form splits before it decodes, so an encoded `%2F` or `%26` inside a value never splits a
key. A malformed `%` sequence stays as it is, and decoding never throws. The finder matches each own
value as it is and percent-encoded, with the hex of an escape in either case.

## The rule families

A prefix-token rule matches a key anywhere in the path and the query. A keyword-assignment rule
matches `keyword=value` in the query and in a path segment of that shape, such as `/keyword=value/`.
The scan gives each rule no file path, so a rule that matches on a file path alone never fires.

## The filters

A filter discards a finding that a public rule would report, such as a placeholder. The builder
turns each filter into data and keeps only the clauses that read the secret or the match: an entropy
limit, a pattern match, a list of strings, each negated or not, and a group of those joined by "or".
A clause that needs more, such as the token-efficiency check, the file path or the text around the
match, never discards, so a conjunction that holds one never discards either. The builder lists each
such clause in the rule file's header. A filter script keeps its recognised parts, and a clause of
any other shape fails the build, so a new upstream form never passes unnoticed.

Keeping the clauses that read only the secret or the match means the scan needs no tokenizer. A
dropped clause lets through a finding that the upstream rules would discard, so the scan refuses
slightly more than upstream does, and never less.

## The builder's choices

The builder makes these choices, and the rule file's header lists each one where it applies:

- It never copies a `validate` script, because one sends the secret over HTTP.
- A rule reports only when each of its required companion rules also matches in the same URL,
  whatever the distance between them. A rule marked `skipReport` serves only as a companion.
- A rule with a file path, or with no pattern, never fires.

## The own values

The server picks the own values from the 6 credential entries of the secrets file by default:
`deployment_key`, `impd_token`, `definitions_export_token`, `definitions_export_app_key`,
`model_credentials` and `connector_credentials`. The `settings` entry holds the user's name and
pronouns, and a scan for them would refuse an ordinary URL that holds the user's name. A map entry
contributes its values and never its keys. [Web fetch](./web-fetch.md#the-config-keys) covers the
keys that change the entries and the minimum length of a value.

## Tests

No committed file holds a value that a rule matches, so a test builds each synthetic key at run time
with `buildKey` from the lib's `test-utils` export. The same arguments always give the same key.
