# 0014: Search

- Date: 2026-10-08
- Status: decided
- Research: [connector notes](../research/2.6-notes/connectors.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#connectors-and-mcp)

Search is one of nixie's own tools, as [0005](./0005-effects-and-taint.md) requires, and its first
provider is Kagi. The tool returns full results, with titles and snippets, and a search marks the
main thread as tainted.

This corrects 0005, which gave "a search API's JSON" as a typed result. In every provider, the
titles and snippets are text from the pages, so they can carry injected instructions. Only the dates
and scores are fully clean, and a URL can hold text in its path.

## Why

- Search quality comes first. A model that sees only URLs ranks results it cannot read.
- The taint costs little. A tainted thread asks only before it acts towards a new destination, and a
  destination named in the owner's own message carries consent under
  [0006](./0006-approval-record.md). "Find X and send it to Sam" runs with no prompt.
- A prompt comes only when the destination comes from the results, which is the case an injection
  aims at.
- A summary from a worker is free text too, so summarising results does not clean them. A worker
  that returns a narrow typed answer, such as a price or a date, stays the route for specific flows.
- Kagi keeps no query log against the account. SearXNG runs on the owner's host, but forwards every
  query and the host's address to the upstream engines, and breaks when they block scraping.

## Alternatives

- **URLs and dates only.** The main thread stays clean, and search gets much worse.
- **A worker that reads the results for every search.** Its summary taints anyway, so it adds a step
  and keeps the taint.
- **SearXNG first.** It needs no account, and it gives less privacy than it appears to.

## Consequences

- The provider sits behind the search tool, so SearXNG or another provider can follow as an adapter.
- The scripted scenarios from 0005 count the prompts that search taint causes. A high count is the
  signal for typed workers on that flow.
- Kagi receives the owner's queries, and each search costs about $0.012.
