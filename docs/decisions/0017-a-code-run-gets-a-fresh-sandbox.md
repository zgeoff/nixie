# 0017: A code run gets a fresh sandbox, whoever calls

- Date: 2026-11-13
- Status: decided

## Decision

Every code run gets a fresh sandbox from the code image, with no network, no grant and no route to
nixie's tools, and nixie destroys it when the call returns. A worker's code run gets one too, and
never runs in the worker's own sandbox. Workers keep their own image, which holds no code tools.

## Why

- The worker's sandbox holds the model credential as a grant, and the worker's context, which can
  hold outside content. A program in that sandbox could reach both. A fresh sandbox holds neither.
- One image and one size serve every code run, so a program behaves the same whoever calls it.
- The code image holds about 690 MB of runtimes and libraries. A worker image with the same tools
  would hold about 1.1 GiB, and every worker would pay for it.

## Rejected alternatives

| Option                                    | Why not                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| the worker's own sandbox, on a code image | The program runs beside the model credential, and every worker carries a 1.1 GiB image. |
| the worker's own sandbox, as it stands    | Workers run on the conversation image, which holds no Python and none of its libraries. |

## Consequences

- A worker's code run waits for a sandbox create, as any other code run does.
- A code run's limits are the same for every caller, and none of them depends on the worker's size.
