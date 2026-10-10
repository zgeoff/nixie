# 0014: Search

- Date: 2026-10-08
- Status: decided, amended by [0015](./0015-taint-scope.md)
- Research:
  [connector notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.6-notes/connectors.md),
  [2.4 to 2.6 landscape](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.4-2.6-data-channels-connectors.md#connectors-and-mcp)

Search is one of nixie's own tools, as [0005](./0005-effects-and-taint.md) requires, and its first
provider is Kagi. The tool returns full results, with titles and snippets, and those results count
as free text under 0005.

A search API's JSON is not a typed result. In every provider, the titles and snippets are text from
the pages, so they can carry injected instructions. Only the dates and scores are fully clean, and a
URL can hold text in its path.

## Why

- Search quality comes first. A model that sees only URLs ranks results it cannot read.
- Full results cost few prompts. The conversation is always untrusted under
  [0015](./0015-taint-scope.md), so nixie asks only before it acts towards a destination with no
  standing permission, and a destination named in the owner's own message carries consent under
  [0006](./0006-approval-record.md). "Find X and send it to Sam" runs with no prompt.
- A prompt comes only when the destination comes from the results, which is the case an injection
  aims at.
- A summary from a worker is free text too, so summarising results does not clean them. A worker
  that returns a narrow typed answer, such as a price or a date, stays the route for specific flows.
- Kagi keeps no query log against the account, and its load balancer keeps logs for 7 days
  ([Kagi privacy](https://kagi.com/privacy), 2026-09-22). SearXNG runs on the owner's host, but
  sends each query on to the services it aggregates, from the host's address
  ([SearXNG docs](https://docs.searxng.org/), 2026-10-08), and breaks when they block scraping.

## Alternatives

- **URLs and dates only.** It keeps page text out of the results, and search gets much worse. The
  conversation stays untrusted either way.
- **A worker that reads the results for every search.** Its summary is free text too, so it adds a
  step and cleans nothing.
- **SearXNG first.** It needs no account, and it gives less privacy than it appears to.

## Consequences

- The provider sits behind the search tool, so SearXNG or another provider can follow as an adapter.
- The scripted scenarios from 0005 count the prompts that follow a search, where the destination
  comes from the results. A high count is the signal to add a rule or loosen the risk stance for
  that flow.
- Kagi receives the owner's queries, and each search costs about $0.012, at $12 per 1,000 searches
  ([Kagi API pricing](https://kagi.com/api/pricing), 2026-10-08).
