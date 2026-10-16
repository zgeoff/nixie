# 0007: Credential grants for imps that read untrusted content

- Date: 2026-10-07
- Updated: 2026-10-15
- Status: decided
- Research:
  [imp broker spike](https://github.com/zgeoff/nixie/tree/e232631a587680970a5c8804455415e7f97140bc/docs/design/platform/spikes/imp-broker/)

An imp that reads untrusted content holds one grant at most: the model API's credential, because the
model loop runs in the imp under [0003](0003-sdk-placement.md). That covers the conversation's imp
and every worker's imp, since the conversation and every job run are untrusted under
[0005](0005-effects-and-taint.md). A fresh imp for a code run takes no grant at all. Code in such an
imp reaches an outside API only through one of nixie's tools on the host, where the destination
limits from 0005 apply. A session on a coding adapter holds broader grants only by your rule for the
coding context, under [0022](0022-coding-and-code-execution.md).

## Why

imp's broker matches a grant on the host only, so a granted host accepts any method, path and body
from the imp. A grant to an imp that reads untrusted content is therefore an exit for whatever data
the imp holds. nixie's own tools hold the credentials on the host, so such an imp loses no
capability, only the direct route. The model API's grant is the exception, because data sent on it
reaches only your own model account, which every turn reaches anyway.

## Alternatives

- **Narrow grants after an imp change.** A method and path filter in imp's broker would allow, for
  example, a GET-only grant on one API path. Data can still leave through the path or the query
  string, so the filter narrows the exit without closing it.

## Consequences

- An API that such code needs becomes a nixie tool.
- A method and path filter for imp's broker is a candidate imp change, because it narrows grants for
  untainted work too.

## Changes

- 2026-10-09: the model API's credential is the one grant such an imp may hold, because every model
  loop moved into an imp under 0003. The first version gave such an imp no grant at all.
