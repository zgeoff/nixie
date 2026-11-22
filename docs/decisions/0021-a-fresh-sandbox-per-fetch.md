# 0021: Each web fetch runs in a sandbox of its own

- Date: 2026-11-22
- Status: decided

## Decision

nixie fetches each web page in a new [sandbox](../architecture/connectors/sandboxes.md), and
destroys the sandbox when the fetch ends in a page, an error or a timeout. The fetcher, the program
that loads the page in the sandbox, works on one URL and exits. Fetches run one at a time, and nixie
starts the next only after it destroys the previous fetch's sandbox, so two fetchers never run side
by side. [Web fetch](../architecture/connectors/web-fetch.md#the-fetch-sandbox) covers the fetch
sandbox.

## Why

- A page that exploits a bug in the fetcher runs its own code in the sandbox. That code sees only
  the one fetch. The URLs of other fetches, which can hold a private address or a token, and the
  files that earlier fetches wrote are never in its sandbox.

## Rejected alternatives

| Option                                       | Why not                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| a pool of sandboxes created ahead and reused | Code that takes control of one fetcher can read or change every later fetch in that sandbox. |

## Consequences

- A fetch that nixie cannot answer from the pages it already stored waits for a sandbox to start,
  and waits for the fetch before it to end.
