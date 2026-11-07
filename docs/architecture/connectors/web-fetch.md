# Web fetch

The web fetch tool reads one public web page for the model and returns its text. nixie never parses
the page itself: a fetcher process inside the fetch sandbox resolves the host, fetches the page and
extracts its text, and nixie reads back one reply. The fetch sandbox has public egress and no
grants, and the sandbox adapter enforces public egress at the network layer, so the network layer is
the boundary that keeps a page away from internal addresses. The fetcher checks every address again
as a second layer, so a resolver trick fails twice, never once. [Sandboxes](./sandboxes.md) covers
the kinds of work and their egress, and [tool calls](./tool-calls.md) covers the endpoint that runs
the tool.

```mermaid
flowchart LR
  E["tool endpoint"] --> T["web fetch tool"]
  T -->|"spawn, one request frame on stdin"| F["fetcher process<br>in the fetch sandbox"]
  F -->|"one reply frame on stdout"| T
  F -->|"public egress only"| W["the page's host"]
```

## The tool

The tool declares only the fetch effect and no destination, so the decision point's read-only rule
allows it and it runs direct, inside the turn. Its result holds the final URL after redirects, the
status code, the content type, the page ID, the part number and the count of parts, the text of one
part, the truncated mark and the blocked reason.

Every field of the result is outside content, because the page and every redirect along the way came
from someone other than the user. The result schema marks the status code, the part number, the
count of parts and the truncated mark as endorsed types, because a number and a boolean cannot carry
the page's words, while a URL can carry text in its path. A refused or failed fetch returns an error
with its reason, which the model reads. When a site's bot protection answers in place of the page,
the result is a page with its status and a blocked reason, so the model can tell the user why the
fetch has no content instead of retrying.

A call names a page in one of these ways, and the tool refuses any other mix of keys:

| Call                                      | Fetches | Returns                                       |
| ----------------------------------------- | ------- | --------------------------------------------- |
| `url`, with an optional `part` or `find`  | yes     | the part named or found, else part 1          |
| `link`, with an optional `part` or `find` | yes     | the same, for the page the link goes to       |
| `page`, with `part` or `find`             | no      | the part named or found, from the stored copy |

A call never gives both `part` and `find`. [Pages and parts](#pages-and-parts) covers the page ID,
`part` and `find`.

## Link IDs

Each link in a page's text reads as a short ID that the conversation session numbers, such as
`[L12]`, so a link costs a few characters in place of its whole URL. A link that leaves the page's
host shows its host and the start of its path after the ID, such as `[L40 · example.org/docs/…]`, so
the model can tell where a link goes before it follows it. The `link_path_chars` value in the
deployment config's `web_fetch` section sets how many characters of the path show, and a longer path
ends in `…`. The cut never splits the escapes of one character. The tag never shows the query string
or the fragment, and shows no path for a link to the host's root. The tool fetches the page a link
ID names, and its result holds the URL the fetch ended at, as a fetch by URL does.

The session numbers each URL once, from a count of its own, so a URL keeps one ID across every page
the session fetches, and the IDs of two sessions are unrelated. A new session's opening record keeps
a random session key, each turn on that session hands the key to its tool calls, and the link store
keys each row by it. A compaction or a forget opens a new session, so an ID from an earlier session
fails with an error that tells the model to fetch the page by its URL again. A call under the run's
own token runs in no session, so the tool keys its links by the run.

Link IDs are the one exception to the rule that every record the model sees takes a short ID from
the database library ([short IDs](../core/database.md#short-ids)). A link ID names a link, not a
record, and it lasts one session, so a count gives the shortest ID and no rebuild from the log needs
it.

The link store and the page store belong to the web fetch tool alone. Each row holds a URL or a
page's text, which can carry text the user forgets, so a forget removes every link and every page on
the conversation's thread
([forgetting and the live session](../memory/context.md#forgetting-and-the-live-session)). A fetch
can outlive the turn a forget aborted, so each turn hands its tool calls the newest session
invalidation its step saw beside the session key. The tool numbers a page's links and stores the
page in the same transaction that checks for a newer invalidation on the thread. When it finds one,
it writes neither and returns an error, so the tool never writes a row to either store after the
cleanup removed the thread's rows.

## Pages and parts

The tool stores the whole text of each page it fetches, so the model can read a page longer than one
result without a new fetch. In one write transaction, the tool numbers every link on the page,
writes each link as its tag, cuts the text into parts, and stores the parts under a page ID from
`createShortID`, such as `tz4a98xxat`. The page store keys each row by the session key, so a page ID
lasts one session, as a link ID does. The tool refuses a page ID from an earlier session, one the
store removed and an invented one alike, with an error, and the model then fetches the page by its
URL again. The tool never returns another page in place of the one named.

The `text_bytes` value of the deployment config's `web_fetch` section sets the most UTF-8 bytes of
one part, its link tags included. The tool ends each part at the last line break within that limit,
else at the last space, else after the last whole character, and never inside a link tag. A tag
longer than a whole part shows as its ID alone, such as `[L12]`, and an ID longer than a whole part
shows nothing, so every tag fits in a part and the tool always finishes cutting. For the same
reason, the tool leaves out a character wider than a whole part, which only a limit under 4 bytes
meets.

`find` takes plain text. The tool returns the part where that text first appears, and up to 10
matches, each with its part number and about 50 characters of the page on each side. The tool
matches the text with a case-insensitive regular expression over the page as stored, and never
lowercases the page first: a lowercased `İ` grows from one code unit to two, which would move every
later match and could pick the wrong part. A match that runs into the next part counts in the part
it starts in. When the text never appears, the tool returns an error with the count of parts, such
as "0 matches in 7 parts of page tz4a98xxat".

The truncated mark means that the fetcher stopped before the page's end, at the body limit or at the
budget of its link targets ([the fetcher](#the-fetcher)), so no part holds that end. A page with no
text, such as an image, returns its URL, status and content type with no text, no page ID, no part
number and a count of 0 parts.

When the tool stores a page, it removes these pages in the same transaction:

- every page of the thread's earlier sessions, which no call can reach again;
- the session's oldest pages, until the session's pages fit the `page_store_bytes` value of the
  `web_fetch` section. The page just stored always stays, even when it alone passes that value.

A forget removes every page on the thread. `remove-web-fetch-pages.ts` in `modules/connectors` makes
every removal from the page store.

## The fetch sandbox

Each fetch runs in a fetch sandbox of its own. nixie creates a new sandbox from the fetch image,
spawns one fetcher process in it, and destroys the sandbox when the fetch ends, so a page that
compromises the fetcher sees only its own fetch and never the URL of another. The fetcher works
inside a new temporary directory that it removes when the fetch ends. nixie talks to the fetcher
only over that process's stdin and stdout, one frame each way, each frame holding one line of JSON
in the format `libs/wire` defines. The request carries the URL, the fetch limits and the ranges the
deployment lists as internal; nothing else nixie holds reaches the sandbox.

Fetches run one at a time, and the next fetch starts only once the last fetch's destroy ends, so no
fetcher ever runs beside another. nixie returns the reply as soon as the fetcher sends it and
destroys the sandbox after, which keeps the destroy off the reply's path.

A fetch that does not end in a page destroys its sandbox the same way: a refusal, a failure the
fetcher reports, a fetcher that exits non-zero or sends no reply, a reply nixie cannot decode, or a
fetcher that outlives the fetch's time limit, which nixie stops. Every call nixie makes to the
sandbox adapter has a time limit as well, so a create or a destroy that never ends fails one fetch
and never blocks the fetches after it.

Every fetch sandbox has the same owner. The first fetch after nixie starts removes every fetch
sandbox of that owner, which clears what an earlier process left. The next fetch after a failed
create or a destroy that fails or passes its time limit does the same, because a create can fail
after the runtime made the sandbox and then fail to remove it. A create that passes its time limit
makes no further adapter call, and nixie destroys a sandbox that the create still returns as soon as
it arrives.

## The fetcher

The fetcher's checks run on every hop, the first request and each redirect alike:

1. It accepts `http` and `https`, and refuses every other scheme. It drops any user name, password
   and fragment from the URL.
2. It resolves the host through the system resolver and checks every A and AAAA address returned.
   One address that is not public refuses the URL.
3. It connects to the address it checked, and sends the host name in the `Host` header, and over
   `https` for TLS too. The connection never asks DNS again, so a second answer cannot move the
   request, and an `https` certificate must still match the host name.

For an `http` URL that names no port, the fetcher tries `https` first, on the address it checked. It
fetches over `http` only when the `https` connection fails to open, such as on a refused connection
or a failed TLS handshake. The `https` try has a fifth of the time limit to open its connection, so
a host that drops packets to port 443 still gets its `http` fetch within the limit. Once the `https`
connection opens, an error or a missing answer fails the fetch, with no `http` try. A redirect goes
to the URL it names, `http` included, with no `https` try first, so a site that redirects from
`https` to `http` cannot loop. The reply's final URL shows the scheme that answered.

A request carries no credential, cookie or stored header, and never goes through a proxy, because a
proxy resolves the host itself and would skip the pinned address. The fetcher refuses the non-public
IPv4 ranges, every IPv6 address outside global unicast, the IPv6 ranges kept for documentation, an
IPv6 address whose embedded IPv4 address is not public, and every range the deployment lists as
internal, whatever its class. The embedded forms it reads are IPv4-mapped, IPv4-compatible,
IPv4-translated, NAT64, 6to4 and Teredo.

Each fetch has 4 limits: the body bytes read, the time for the whole call with its redirects, the
number of redirects, and the bytes of text returned. The deployment config sets the first 3, and the
caller sets the text limit. The web fetch tool asks for text up to 3 times the body limit, because
one body byte decodes to at most 3 bytes of UTF-8 text, so its text stops only where the body does.
The fetch that reads a skill's files asks for up to the file size limit of the
[definitions repo](../core/definitions.md). The body limit counts bytes after a compressed body is
decoded, so a small compressed body cannot expand past it. Reaching the body limit or the text limit
stops the read and marks the result truncated, and the text cut never splits a character. Passing
the time limit or the redirect limit fails the fetch.

The reply lists the target of each link mark the cut text keeps and no other. The targets have a
byte budget of their own, a fixed multiple of the text limit, and the text stops before the first
mark whose target would pass it, so a page of long links still fits the reply's size limit, which
nixie sets from both budgets. A host and path can run far longer than their mark, so nixie cuts the
text into parts only once each link reads as its tag ([pages and parts](#pages-and-parts)).

The default `text_bytes` value, the most bytes of one part, sits under the tool-output limit that
the conversation guest sets for the Agent SDK's CLI, so every part reaches the model whole. The CLI
saves a result past its tool-output limit to a file, and the model has no tool to read a file. The
guest turns those files off, so the CLI cuts any longer result and keeps it inline.

### The page text

An HTML page returns its readable text: the title, then the text of the page's main content, outside
scripts, styles and other hidden elements, with a line break around each block. The main content is
the page's articles, else its main element, else the whole page without its own header and footer,
and the fetcher takes the next of those when one holds no text. The text of navigation and asides
never counts as main content, so site menus never come before the content. An article comes before
the main element because a site's main element often holds toolbars around the article.

The readable text marks where each link ends, so the model can follow a link to the next page. The
fetcher writes a mark after the text of each link in the main content and lists each mark's target,
resolved against the page's final URL, beside the text, and nixie writes each mark as the link's ID.
A mark is the link's index between two private-use characters, and the fetcher strips both
characters from the page's own text, so a page cannot forge a mark. After the main content comes a
list headed "Other links on this page", which holds the links from the rest of the page, such as its
navigation, asides, header and footer. The list holds each target once, leaves out a target the main
content shows, and stops at a fixed count, so a page of menus cannot fill the text limit. The list
comes last, so a page cut at the text limit loses its list before its article. A link to the page
itself, to a fragment of it, or through a scheme other than `https` and `http`, such as
`javascript:`, keeps only its text and gets no mark, because the model has nothing to fetch there.

Another text type returns as it arrived, in the charset its content type names, and a binary type
returns no text, so the fetcher never reads its body. A 403 or 503 that carries Cloudflare's
challenge header, or the markup of its challenge page, sets the blocked reason. A challenge needs a
browser that runs its script, so the fetcher reports it rather than trying to pass it.

## The fetch image

The fetch image holds a minimal base with Bun and the fetcher bundled into one file, built from
`guests/fetch` with its Dockerfile. [The imp isolation tests](../../runbooks/imp-isolation-tests.md)
run the fetch sandbox on an imp host against the image: a public page succeeds, and a direct
connection to impd or the host's addresses fails.
