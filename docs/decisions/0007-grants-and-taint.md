# 0007: Credential grants for tainted tasks

- Date: 2026-10-07
- Status: decided
- Research: [imp broker spike](../../spikes/imp-broker/),
  [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#the-imp-credential-broker)

An imp that serves a tainted task from [0005](./0005-effects-and-taint.md) gets no credential grant.
Code that such a task runs inside an imp reaches an outside API only through one of nixie's tools on
the host, where the destination checks from 0005 apply. An imp that serves an untainted task, such
as a coding session, takes grants under the owner's rules.

## Why

imp's broker matches a grant on the host only, so a granted host accepts any method, path and body
from the imp. A grant to a tainted task is therefore an exit for the owner's data. After
[0002](./0002-approvals.md) and [0003](./0003-sdk-placement.md), nixie's own tools hold the
credentials on the host, so a tainted task loses no capability, only the direct route.

## Alternatives

- **Narrow grants after an imp change.** A method and path filter in imp's broker would allow, for
  example, a GET-only grant on one API path. Data can still leave through the path or the query
  string, so the filter narrows the exit without closing it.

## Consequences

- An API that tainted code needs becomes a nixie tool.
- A method and path filter for imp's broker goes to imp as its own issue, because it narrows grants
  for untainted work too.
