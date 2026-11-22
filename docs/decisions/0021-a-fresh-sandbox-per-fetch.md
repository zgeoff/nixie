# 0021: Each web fetch runs in a sandbox of its own

- Date: 2026-11-22
- Status: decided

## Decision

nixie fetches each web page in a new sandbox, and destroys the sandbox when the fetch ends, whether
it ends in a page, a refusal, a failure or a timeout. The fetcher, the program that loads the page
in the sandbox, works on one URL and exits. Fetches run one at a time, and nixie starts the next
only after it destroys the previous fetch's sandbox, so no two fetchers ever run side by side.
[Web fetch](../architecture/connectors/web-fetch.md#the-fetch-sandbox) covers the fetch sandbox.

## Why

- A page can carry code that takes control of the fetcher. That code sees only its own fetch. It
  never sees the URL of another fetch, which can hold a private address or a token, or a file an
  earlier page wrote.

## Rejected alternatives

| Option                                       | Why not                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| a pool of sandboxes created ahead and reused | Code that takes control of one fetcher can read or change every later fetch in that sandbox. |

## Consequences

- Each fetch that the page store cannot answer waits for a sandbox to start, and fetches wait for
  each other.
