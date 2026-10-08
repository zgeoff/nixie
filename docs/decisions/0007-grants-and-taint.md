# 0007: Credential grants for imps that read untrusted content

- Date: 2026-10-07
- Status: decided, amended by [0015](./0015-taint-scope.md),
  [0022](./0022-coding-and-code-execution.md) and
  [0026](./0026-where-workers-and-the-conversation-run.md)
- Research: [imp broker spike](../../spikes/imp-broker/),
  [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#the-imp-credential-broker)

An imp that reads untrusted content, or runs code for the conversation or a job run, gets no
credential grant. [0015](./0015-taint-scope.md) treats the conversation as always untrusted, and
every job run in the first build as untrusted too. Code in such an imp reaches an outside API only
through one of nixie's tools on the host, where the destination limits from
[0005](./0005-effects-and-taint.md) apply. nixie's own imps that run code take no grants. A session
on a coding agent adapter can hold grants only by the owner's rule for the coding context, under
[0022](./0022-coding-and-code-execution.md).

## Why

imp's broker matches a grant on the host only, so a granted host accepts any method, path and body
from the imp. A grant to an imp that reads untrusted content is therefore an exit for whatever data
the imp holds. After [0002](./0002-approvals.md) and [0003](./0003-sdk-placement.md), nixie's own
tools hold the credentials on the host, so such an imp loses no capability, only the direct route.

## Alternatives

- **Narrow grants after an imp change.** A method and path filter in imp's broker would allow, for
  example, a GET-only grant on one API path. Data can still leave through the path or the query
  string, so the filter narrows the exit without closing it.

## Consequences

- An API that such code needs becomes a nixie tool.
- A method and path filter for imp's broker is a candidate change to imp, because it narrows grants
  for untainted work too.
