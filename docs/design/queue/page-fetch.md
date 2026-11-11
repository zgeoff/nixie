# The flow of a page fetch, and the URL rewrite

A `url` or `link` call of the web fetch tool runs one fixed list of 9 steps, in `runPageFetch`. This
doc holds that list and one of its steps, the URL rewrite. Some pages are mostly navigation: a
GitHub file page, an npm package page. For such a page, nixie fetches the raw or JSON form of the
same content, so the model reads less noise. The list is in this doc because 2 more docs each own
some of its steps: [the pause per host and the page cache](page-fetch-pause-and-cache.md) and
[the refusal of a URL that carries a secret](secret-url-refusal.md).

This doc holds the rules. The files in `sketches/web/` hold the TypeScript shapes and the exact text
of each error, and a "Shape", "Flow", "Usage" or "Text" line points at the section of one. The
[glossary](../../glossary.md) holds the terms that this doc does not define. A rule that ends with
`(open: <name>)` is the intended design and is not settled: [the open list](open/web.md) holds the
item of that name, with its issue.

In this doc, "the server" is the nixie server, and "a host" is the host of a URL.

## Built

The code on the main branch does this. Every section after this one is design.

- A call of the web fetch tool holds exactly one of 3 inputs. `url` is a URL. `link` is the ID of a
  link that a page showed. `page` is the ID of a stored page.
- `runPageFetch` takes the URL of a `url` call, or the URL that the link ID of a `link` call stands
  for, and calls `readPage` once with that URL.
- The result's `url` is the URL the fetch ended at.
- The fetcher is the program in the fetch sandbox that sends the request. It sends an `Accept`
  header that puts HTML first. It returns every `text/*` reply as text. It marks each link of an
  HTML page with a link ID, and never marks a link of a page of another content type.
- The fetcher follows redirects itself, inside the fetch sandbox. The server sends one
  `FetchRequest` and reads one `FetchReply`.
- A `FetchReply` is a page, an image, `refused` or `failed`. A page reply holds `blocked`, which
  this doc calls the blocked reason. It is null, or it is what blocked the page, such as a bot
  challenge that the fetcher found.
- The fetcher sends each request without a credential.
- `startFetchSandbox` returns the server's `readPage`. Fetches go through one queue, one at a time,
  and the server destroys each fetch sandbox after its fetch.
- The skill file reader fetches the files of a skill and builds its own URLs. The server calls
  `startFetchSandbox` a second time for it, so it has a `readPage` of its own.
- `writeWebFetchPage` writes a page and its links in one transaction. Inside it, the function reads
  whether a forget ended the session, and writes nothing when one did. It stores a row only for a
  page with text.
- The tool runner writes the call record before the tool runs and the result record after it.

## The two URLs of a call

A call has 2 URLs, and every step works on one of them:

- **The named URL** is the URL in a call's `url`, or the URL that its link ID stands for.
- **The sent URL** is the URL that the server sends to the fetcher.

**The first pass** is steps 3 to 7 with the sent URL that step 2 gives: the rewritten URL when a
rewrite rule matches the named URL, and the named URL otherwise. **A rewritten URL** is a sent URL
that a rule made.

**A hop** is one URL of a fetch. Hop 0 is the sent URL, and each redirect adds 1.

## The steps of a call

`runPageFetch` is a list of named steps. Each step is one call to a function in a file of its own,
so a builder adds a step by adding one line to the list. The steps never write the call record or
the result record. Flow: [the steps as code](sketches/web/03-flow.ts), sections A and B.

| Step | Name     | What nixie does                                                     | What nixie records                |
| ---- | -------- | ------------------------------------------------------------------- | --------------------------------- |
| 1    | Parse    | parses the call and reads the link's target, which is the named URL | nothing                           |
| 2    | Rewrite  | calls `rewriteFetchURL` on the named URL, which gives the sent URL  | nothing                           |
| 3    | Scan     | calls `refuseFetchURL` on the sent URL                              | a log event, only on a refusal    |
| 4    | Cache    | returns the stored copy of the sent URL, when the store holds one   | nothing                           |
| 5    | Pause    | reads the pause of the sent URL's host                              | nothing                           |
| 6    | Fetch    | calls `readPage` on the sent URL, which starts one sandbox          | the sandbox's records             |
| 7    | Set      | sets a pause from the reply                                         | the pause, in the server's memory |
| 8    | Fallback | runs steps 3, 5, 6 and 7 once more, on the named URL                | nothing of its own                |
| 9    | Store    | writes the page and its links in one transaction                    | the page row with its link rows   |

- Step 3 scans the sent URL for a secret. On a match, nixie asks the call's exemption, a function
  that lets some matched URLs through, and ends the call with a refusal when the exemption returns
  false.
- In step 6 the fetcher asks the server before it follows each redirect, and the server scans that
  hop the same way. A refused hop ends the call. [The secret refusal](secret-url-refusal.md) owns
  the scan, the exemption and the refusal, and [the hop gate](secret-url-hops.md) owns the ask.
- [The pause and the cache](page-fetch-pause-and-cache.md) owns steps 4, 5 and 7. A pause is a
  length of time in which nixie sends no fetch to one host. In step 5 the call waits out a pause of
  the config value `backoff_wait_ms` or less. On a longer pause, the call takes step 8 when the sent
  URL is a rewritten URL, and ends with the pause error otherwise.
- Step 4 is part of the design only when your decision is to have a cache. (open: page cache)
- Step 7 runs for every reply that has a status, a 2xx reply included. It runs before nixie decides
  on step 8.
- Step 8 runs only for a sent URL that a rule rewrote. [The fallback](#the-fallback) holds its
  rules.
- Step 9 stores a row only for a page with text. nixie stores no row for an image.
- A `page` call reads a stored page and runs none of these steps.

## The rewrite rules

The connectors module owns `rewriteFetchURL`. The rules are a list of data in the code: each rule is
a name, its hosts, and a pure function from a parsed URL to a URL or null. The rules have no config
key, because a config value cannot hold a function. Shape:
[the rule function and the 5 URL patterns](sketches/web/02-types.ts), section A. Usage:
[a rewritten fetch](sketches/web/01-usage.ts), section A.

nixie has 5 rules:

- `github-blob`: for a file page of a GitHub repo, nixie fetches the raw file.
- `github-tree`: for a folder page of a GitHub repo, nixie fetches the folder's listing from
  GitHub's API. (open: branch slash)
- `npm-package`: for a package page of npm, nixie fetches one version's document from the registry.
- `pypi-project`: for a project page of PyPI, nixie fetches the project's JSON document.
- `wikipedia-article`: for an article of Wikipedia, on the desktop or the mobile host, nixie fetches
  the article's HTML from the REST API. (open: wikipedia path)

Every rule follows these limits:

- A rule matches an `http` or `https` URL whose host is exactly one of the rule's hosts. A URL with
  an explicit port matches no rule.
- A rule drops the fragment.
- A URL with a query string matches no rule. The one exception is `?plain=1` on a GitHub blob.
- One rule applies, once, to the named URL. nixie never rewrites a redirect hop.
- The `github-tree` rule reads the first path segment after `tree` as the ref.
- The `npm-package` rule fetches the `latest` document when the URL holds no version. It never
  fetches the whole registry document: that document of a popular package is past 4 MB, over the
  fetcher's 2 MiB body limit. One version's document is about 4 KB and holds no readme.
- The `npm-package` rule writes the slash of a scoped name as `%2F` in the registry URL. The
  `wikipedia-article` rule writes a slash in a title as `%2F`, because a title is one path segment.

The model reads a rewritten fetch like this:

- The tool's input is the same with a rewrite and without one. The result's `url` is the URL the
  fetch ended at, so it shows the rewritten URL.
- The tool's description holds one sentence about the rewrite: a page of a known site comes back in
  its raw or JSON form, and `url` shows what nixie fetched. (open: description sentence)
- The fetcher puts no link IDs in a markdown or JSON reply. A markdown link reads as the page wrote
  it.

## The fallback

The fallback is step 8. Its other name is **the second pass**: nixie runs steps 3, 5, 6 and 7 once
more, and in that pass the sent URL is the named URL. The first pass is steps 3 to 7 on the
rewritten URL.

A **rate-limit reply** is a reply whose blocked reason is null and whose status is one of these:

- 429 or 503;
- 403, with a `retryAfterMs` that is not null.

`retryAfterMs` is the wait that the reply's headers ask for, and
[the pause and the cache](page-fetch-pause-and-cache.md#the-wire-field) owns it. A 2xx reply is
never a rate-limit reply. Flow: [the test for a rate-limit reply](sketches/web/03-flow.ts), section
A.

nixie runs the second pass only when the sent URL of the first pass is a rewritten URL, and one of
these holds:

- the reply's status is 404;
- the reply is a rate-limit reply;
- step 5 met a pause longer than the config value `backoff_wait_ms`, so the first pass sent no
  fetch.

The rules:

- A rewrite never hides a page that exists. The `github-tree` rule reads a wrong ref from a branch
  name that holds a slash. The rewritten URL then answers 404, and the second pass reads the page.
- When a site's rate limit is spent, nixie returns the page in its full form in place of the raw or
  JSON form, and never an error. GitHub's API allows 60 requests an hour without a credential, and
  the skill file reader spends the same limit from the same address.
- A 200 never sets off the second pass, whatever its headers hold.
- A `failed` reply never sets off the second pass. Neither does a reply with a blocked reason, nor a
  refused hop.
- The second pass never rewrites, so nixie rewrites a URL once.
- The second pass never sets off a third. Whatever it gives is the call's outcome: a 404, a
  rate-limit reply and a pause error included.
- Step 3 of the second pass scans the named URL. It uses the same exemption as the first pass.
- After a second pass, step 9 stores the named URL's page.

## The Accept header

The fetcher asks every site for markdown before HTML. Shape:
[the header's value](sketches/web/02-types.ts), section B.

- The fetcher returns a `text/markdown` reply as text, as it returns every `text/*` type.

## Where the rewrite sits

- The rewrite is a step of the web fetch tool. `readPage` takes the sent URL and rewrites nothing.
- The skill file reader calls its own `readPage`, and its URLs take no rewrite.

## A stop of the server during a call

- A stop in steps 1 to 8 ends with a call record and no result record, as a stop in any tool call
  does. The sandbox module removes the fetch's sandbox.
- Step 9 is one transaction. A stop there ends with the page stored whole or not at all.
- When a forget ends the session while the fetch runs, step 9 writes no row.

## Not in scope

- A rewrite that needs a credential.
- A rule for a repo's root page, an issue or a pull request.
- Link IDs in a markdown or JSON reply.
- The skill file reader's URLs.
- A config key for the rules.
- A `PageReader` object or port in front of `readPage`. A second page reader is separate work.
  [The rules for any port](port-rules.md) own when a port exists. (open: page reader port)
